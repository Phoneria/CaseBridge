"""SSE streaming of an assistant reply.

The request's DB session is closed before a StreamingResponse body runs, so
the final state of the assistant message is written through a fresh session
from `session_factory` when the stream ends - completed, failed, or closed
early by the client (status 'stopped'). A reply cut off by the token cap
(provider finish reason "length") is saved as complete with truncated=True,
or as an error when nothing usable was produced."""
import json
import logging
import time
from typing import AsyncIterator, Callable

from sqlalchemy.orm import Session
from starlette.concurrency import iterate_in_threadpool

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError
from app.models.chat import ChatConversation, ChatMessage, ChatMessageStatus
from app.schemas.chat import ChatMessageOut
from app.services.chat_service import utcnow

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
LENGTH_LIMIT_MESSAGE = "Yanıt uzunluk sınırına ulaştı. Daha kapsamlı bir seviyeyle tekrar deneyin."
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
) -> AsyncIterator[str]:
    parts: list[str] = []
    status = ChatMessageStatus.STOPPED
    started = time.monotonic()
    try:
        yield sse(start_event)
        try:
            async for chunk in iterate_in_threadpool(provider.stream(history)):
                parts.append(chunk)
                yield sse({"type": "delta", "text": chunk})
        except AIProviderError as exc:
            saved = _try_persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts),
                ChatMessageStatus.ERROR, provider.last_usage, (time.monotonic() - started) * 1000,
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
                ChatMessageStatus.ERROR, provider.last_usage, (time.monotonic() - started) * 1000,
            )
            if saved is not _FAILED:
                status = ChatMessageStatus.ERROR
            yield sse({"type": "error", "message": PERSIST_FAILED_MESSAGE if saved is _FAILED else LENGTH_LIMIT_MESSAGE})
            return
        saved = _try_persist(
            session_factory, assistant_message_id, conversation_id, content,
            ChatMessageStatus.COMPLETE, provider.last_usage, (time.monotonic() - started) * 1000,
            truncated=truncated,
        )
        if saved is _FAILED:
            yield sse({"type": "error", "message": PERSIST_FAILED_MESSAGE})
        elif saved is None:
            # The message vanished (conversation deleted mid-stream).
            status = ChatMessageStatus.COMPLETE
            yield sse({"type": "error", "message": DELETED_MESSAGE})
        else:
            status = ChatMessageStatus.COMPLETE
            yield sse({"type": "done", "message": saved})
    finally:
        if status == ChatMessageStatus.STOPPED:
            _persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts), status,
                provider.last_usage, (time.monotonic() - started) * 1000,
            )
