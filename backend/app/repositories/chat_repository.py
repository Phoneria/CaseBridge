"""Chat data access. Every conversation query filters by both law_firm_id
and user_id: chats are private to their author, even inside a firm."""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.chat import ChatConversation, ChatMessage


class ChatRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_conversations(self, law_firm_id: str, user_id: str) -> list[ChatConversation]:
        return (
            self.db.query(ChatConversation)
            .filter(ChatConversation.law_firm_id == law_firm_id, ChatConversation.user_id == user_id)
            .order_by(ChatConversation.updated_at.desc())
            .all()
        )

    def get_conversation(self, conversation_id: str, law_firm_id: str, user_id: str) -> Optional[ChatConversation]:
        return (
            self.db.query(ChatConversation)
            .filter(
                ChatConversation.id == conversation_id,
                ChatConversation.law_firm_id == law_firm_id,
                ChatConversation.user_id == user_id,
            )
            .first()
        )

    def list_messages(self, conversation_id: str) -> list[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .all()
        )

    def get_message_for_user(self, message_id: str, law_firm_id: str, user_id: str) -> Optional[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .join(ChatConversation, ChatMessage.conversation_id == ChatConversation.id)
            .filter(
                ChatMessage.id == message_id,
                ChatConversation.law_firm_id == law_firm_id,
                ChatConversation.user_id == user_id,
            )
            .first()
        )

    def save(self, obj) -> None:
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)

    def delete(self, obj) -> None:
        self.db.delete(obj)
        self.db.commit()
