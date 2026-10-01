"""Chat conversations (Hukuk Asistanı): CRUD and titles. Message sending,
history, feedback and export are added by later tasks."""
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.chat.base import ChatTurn
from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT
from app.models.chat import DEFAULT_CHAT_TITLE, ChatConversation, ChatMessage, ChatMessageStatus, ChatRole
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

    def add_user_message(self, conversation: ChatConversation, content: str) -> ChatMessage:
        message = ChatMessage(
            conversation_id=conversation.id,
            law_firm_id=conversation.law_firm_id,
            role=ChatRole.USER,
            content=content.strip(),
        )
        if conversation.title == DEFAULT_CHAT_TITLE:
            conversation.title = make_title(content)
        conversation.updated_at = utcnow()
        self.db.add(conversation)
        self.repo.save(message)
        return message

    def create_assistant_placeholder(self, conversation: ChatConversation, model: str) -> ChatMessage:
        message = ChatMessage(
            conversation_id=conversation.id,
            law_firm_id=conversation.law_firm_id,
            role=ChatRole.ASSISTANT,
            content="",
            status=ChatMessageStatus.STREAMING,
            model=model,
        )
        self.repo.save(message)
        return message

    def build_history(self, conversation: ChatConversation, limit: int) -> list[ChatTurn]:
        usable = [
            m
            for m in self.repo.list_messages(conversation.id)
            if m.role == ChatRole.USER or m.status == ChatMessageStatus.COMPLETE
        ]
        recent = usable[-limit:] if limit > 0 else usable
        return [{"role": "system", "content": CHAT_SYSTEM_PROMPT}] + [
            {"role": m.role.value, "content": m.content} for m in recent
        ]

    def set_feedback(self, message_id: str, law_firm_id: str, user_id: str, value: int) -> Optional[ChatMessage]:
        message = self.repo.get_message_for_user(message_id, law_firm_id, user_id)
        if message is None:
            return None
        if message.role != ChatRole.ASSISTANT or message.status != ChatMessageStatus.COMPLETE:
            raise ValueError("Yalnızca tamamlanmış asistan yanıtları oylanabilir.")
        message.feedback = value or None
        self.repo.save(message)
        return message

    def export_jsonl(self, law_firm_id: str, model: Optional[str] = None) -> str:
        """One OpenAI chat fine-tuning example per liked, complete assistant
        message: system prompt + the conversation up to and including it."""
        query = self.db.query(ChatMessage).filter(
            ChatMessage.law_firm_id == law_firm_id,
            ChatMessage.role == ChatRole.ASSISTANT,
            ChatMessage.status == ChatMessageStatus.COMPLETE,
            ChatMessage.feedback == 1,
        )
        if model:
            query = query.filter(ChatMessage.model == model)
        lines: list[str] = []
        for target in query.order_by(ChatMessage.created_at.asc()).all():
            turns = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            for message in self.repo.list_messages(target.conversation_id):
                if message.role == ChatRole.USER or message.status == ChatMessageStatus.COMPLETE:
                    turns.append({"role": message.role.value, "content": message.content})
                if message.id == target.id:
                    break
            lines.append(json.dumps({"messages": turns}, ensure_ascii=False))
        return "".join(line + "\n" for line in lines)
