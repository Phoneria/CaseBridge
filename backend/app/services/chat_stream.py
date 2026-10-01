"""SSE streaming of an assistant reply.

The request's DB session is closed before a StreamingResponse body runs, so
the final state of the assistant message is written through a fresh session
from `session_factory` when the stream ends - completed, failed, or closed
early by the client (status 'stopped')."""
import json
import time
from typing import AsyncIterator, Callable

from sqlalchemy.orm import Session
from starlette.concurrency import iterate_in_threadpool

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError
from app.models.chat import ChatConversation, ChatMessage, ChatMessageStatus
from app.schemas.chat import ChatMessageOut
from app.services.chat_service import utcnow


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
) -> dict | None:
    db = session_factory()
    try:
        message = db.get(ChatMessage, assistant_message_id)
        if message is None:
            return None
        message.content = content
        message.status = status
        message.latency_ms = latency_ms
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
            status = ChatMessageStatus.ERROR
            _persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts), status,
                provider.last_usage, (time.monotonic() - started) * 1000,
            )
            yield sse({"type": "error", "message": str(exc)})
            return
        status = ChatMessageStatus.COMPLETE
        saved = _persist(
            session_factory, assistant_message_id, conversation_id, "".join(parts), status,
            provider.last_usage, (time.monotonic() - started) * 1000,
        )
        yield sse({"type": "done", "message": saved})
    finally:
        if status == ChatMessageStatus.STOPPED:
            _persist(
                session_factory, assistant_message_id, conversation_id, "".join(parts), status,
                provider.last_usage, (time.monotonic() - started) * 1000,
            )
