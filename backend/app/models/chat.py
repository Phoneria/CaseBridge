import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import str_enum

DEFAULT_CHAT_TITLE = "Yeni sohbet"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessageStatus(str, enum.Enum):
    STREAMING = "streaming"
    COMPLETE = "complete"
    ERROR = "error"
    STOPPED = "stopped"


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default=DEFAULT_CHAT_TITLE)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    role: Mapped[ChatRole] = mapped_column(str_enum(ChatRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[Optional[ChatMessageStatus]] = mapped_column(str_enum(ChatMessageStatus), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    level: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    #: True when a complete reply was cut off by the level's token cap.
    truncated: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feedback: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
