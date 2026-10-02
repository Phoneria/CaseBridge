from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.chat import ChatMessageStatus, ChatRole


class ChatStatusOut(BaseModel):
    provider: str
    model: str
    configured: bool
    external: bool
    error: Optional[str] = None


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    role: ChatRole
    content: str
    status: Optional[ChatMessageStatus] = None
    model: Optional[str] = None
    level: Optional[str] = None
    truncated: Optional[bool] = None
    feedback: Optional[int] = None
    created_at: datetime


class ChatConversationSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    updated_at: datetime


class ChatConversationOut(ChatConversationSummaryOut):
    messages: list[ChatMessageOut] = []


class ChatConversationRename(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def _title_length(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 120:
            raise ValueError("Başlık 1-120 karakter olmalıdır.")
        return value


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Mesaj boş olamaz.")
        return value


class ChatFeedbackIn(BaseModel):
    value: Literal[1, -1, 0]
