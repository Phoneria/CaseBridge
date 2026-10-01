"""Chat conversations (Hukuk Asistanı): CRUD and titles. Message sending,
history, feedback and export are added by later tasks."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.chat import ChatConversation, ChatMessage
from app.repositories.chat_repository import ChatRepository

TITLE_SOURCE_LENGTH = 60


def make_title(content: str) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= TITLE_SOURCE_LENGTH:
        return collapsed
    return collapsed[:TITLE_SOURCE_LENGTH] + "…"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChatService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ChatRepository(db)

    def list_conversations(self, law_firm_id: str, user_id: str) -> list[ChatConversation]:
        return self.repo.list_conversations(law_firm_id, user_id)

    def create_conversation(self, law_firm_id: str, user_id: str) -> ChatConversation:
        conversation = ChatConversation(law_firm_id=law_firm_id, user_id=user_id)
        self.repo.save(conversation)
        return conversation

    def get_conversation(self, conversation_id: str, law_firm_id: str, user_id: str) -> Optional[ChatConversation]:
        return self.repo.get_conversation(conversation_id, law_firm_id, user_id)

    def rename(self, conversation: ChatConversation, title: str) -> ChatConversation:
        conversation.title = title
        conversation.updated_at = utcnow()
        self.repo.save(conversation)
        return conversation

    def delete(self, conversation: ChatConversation) -> None:
        for message in self.repo.list_messages(conversation.id):
            self.db.delete(message)
        self.repo.delete(conversation)

    def messages(self, conversation: ChatConversation) -> list[ChatMessage]:
        return self.repo.list_messages(conversation.id)
