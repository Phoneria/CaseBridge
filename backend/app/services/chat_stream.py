"""SSE streaming of an assistant reply.

The request's DB session is closed before a StreamingResponse body runs, so
the final state of the assistant message is written through a fresh session
from `session_factory` when the stream ends - completed, failed, or closed
early by the client (status 'stopped'). A reply cut off by the token cap
(provider finish reason "length") is saved as complete with truncated=True,
or as an error when nothing usable was produced.

With a ChatToolRunner (CaseBridge AI data tools) the read-only tools run
first: "tool" progress events, then one "sources" event with the links the
answer may cite; the same sources ride on the final "done" event."""
import json
import logging
import time
from typing import AsyncIterator, Callable, Optional

from sqlalchemy.orm import Session
from starlette.concurrency import iterate_in_threadpool

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError
from app.models.chat import ChatConversation, ChatMessage, ChatMessageStatus
from app.schemas.chat import ChatMessageOut
from app.services.chat_service import utcnow
from app.services.chat_tool_runner import ChatToolRunner

logger = logging.getLogger("casebridge")


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _persist(
    session_factory: Callable[[], Session],
    assistant_message_id: str,
    conversation_id: str,
    content: str,
    status: ChatMessageStatus,
    usage: dict | None,
    latency_ms: float,
    truncated: bool | None = None,
    sources: list[dict] | None = None,
) -> dict | None:
    db = session_factory()
    try:
        message = db.get(ChatMessage, assistant_message_id)
        if message is None:
            return None
        message.content = content
        message.status = status
        message.latency_ms = latency_ms
        message.truncated = truncated
        message.sources = sources
        if usage:
            message.prompt_tokens = usage.get("prompt_tokens")
            message.completion_tokens = usage.get("completion_tokens")
        conversation = db.get(ChatConversation, conversation_id)
        if conversation is not None:
            conversation.updated_at = utcnow()
        db.commit()
        db.refresh(message)
        return ChatMessageOut.model_validate(message).model_dump(mode="json")
    finally:
        db.close()


PERSIST_FAILED_MESSAGE = "Yanıt kaydedilemedi."
DELETED_MESSAGE = "Sohbet silindiği için yanıt kaydedilemedi."
LENGTH_LIMIT_MESSAGE = "Yanıt uzunluk sınırına ulaştı. Soruyu daraltarak tekrar deneyin."
_FAILED = object()


def _try_persist(*args, **kwargs) -> dict | None | object:
    """_persist, but a failure returns _FAILED so the caller leaves the status
    as 'stopped' and the finally block retries the write."""
    try:
        return _persist(*args, **kwargs)
    except Exception:
        return _FAILED


async def stream_assistant_reply(
    *,
    provider: ChatProvider,
    history: list[ChatTurn],
    start_event: dict,
    assistant_message_id: str,
    conversation_id: str,
    session_factory: Callable[[], Session],
    tool_runner: Optional[ChatToolRunner] = None,
) -> AsyncIterator[str]:
    parts: list[str] = []
    status = ChatMessageStatus.STOPPED
    started = time.monotonic()
    sources: list[dict] = []
    # Saved on the answer: None without data tools, else the links (possibly none).
    persisted_sources: list[dict] | None = None

    def _usage() -> dict | None:
        """The answer's tokens plus any tool-planning tokens (they count against the AI budget)."""
        usage = provider.last_usage
        plan = tool_runner.plan_usage if tool_runner is not None else None
        if not plan or not any(plan.values()):
            return usage
        return {key: (usage or {}).get(key, 0) + plan[key] for key in ("prompt_tokens", "completion_tokens")}

    try:
        yield sse(start_event)
        # A provider that runs the read-only tools itself (Claude subagent) gets
        # the runner and streams tool events and text in one pass; others plan
        # first, then stream the answer.
        agent_tools = tool_runner is not None and getattr(provider, "runs_own_tools", False)
        if tool_runner is not None and not agent_tools:
            async for event in iterate_in_threadpool(tool_runner.run(history)):
                yield sse(event)
            history = tool_runner.final_history(history)
            sources = [source.as_dict() for source in tool_runner.sources]
            persisted_sources = sources if tool_runner.allowed else None
            if tool_runner.calls:
                yield sse({"type": "sources", "sources": sources})
        try:
            chunks = provider.stream_with_tools(tool_runner, history) if agent_tools else provider.stream(history)
            async for chunk in iterate_in_threadpool(chunks):
                if isinstance(chunk, dict):  # tool progress from the agent
                    yield sse(chunk)
                    continue
                parts.append(chunk)
                yield sse({"type": "delta", "text": chunk})
            if agent_tools:
                sources = [source.as_dict() for source in tool_runner.sources]
                persisted_sources = sources if tool_runner.allowed else None
                if tool_runner.calls:
                    yield sse({"type": "sources", "sources": sources})
        except AIProviderError as exc:
            saved = _try_persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts),
                ChatMessageStatus.ERROR, _usage(), (time.monotonic() - started) * 1000, sources=persisted_sources,
            )
            if saved is _FAILED:
                yield sse({"type": "error", "message": PERSIST_FAILED_MESSAGE})
            else:
                status = ChatMessageStatus.ERROR
                yield sse({"type": "error", "message": str(exc)})
            return
        content = "".join(parts)
        truncated = provider.last_finish_reason == "length"
        if truncated:
            # No content in the log: chat text may hold client details.
            logger.warning(
                "Chat reply hit the token cap (model=%s, max_tokens=%s, empty=%s)",
                provider.model, provider.max_tokens, not content.strip(),
            )
        if truncated and not content.strip():
            saved = _try_persist(
                session_factory, assistant_message_id, conversation_id, content,
                ChatMessageStatus.ERROR, _usage(), (time.monotonic() - started) * 1000, sources=persisted_sources,
            )
            if saved is not _FAILED:
                status = ChatMessageStatus.ERROR
            yield sse({"type": "error", "message": PERSIST_FAILED_MESSAGE if saved is _FAILED else LENGTH_LIMIT_MESSAGE})
            return
        saved = _try_persist(
            session_factory, assistant_message_id, conversation_id, content,
            ChatMessageStatus.COMPLETE, _usage(), (time.monotonic() - started) * 1000,
            truncated=truncated, sources=persisted_sources,
        )
        if saved is _FAILED:
            yield sse({"type": "error", "message": PERSIST_FAILED_MESSAGE})
        elif saved is None:
            # The message vanished (conversation deleted mid-stream).
            status = ChatMessageStatus.COMPLETE
            yield sse({"type": "error", "message": DELETED_MESSAGE})
        else:
            status = ChatMessageStatus.COMPLETE
            yield sse({"type": "done", "message": saved, **({"sources": sources} if tool_runner is not None else {})})
    finally:
        if status == ChatMessageStatus.STOPPED:
            _persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts), status,
                _usage(), (time.monotonic() - started) * 1000, sources=persisted_sources,
            )
