"""Chat conversations (Hukuk Asistanı): conversation CRUD and auto titles,
user/assistant message rows, the provider history for an answer level
(system prompt + the level's history limit), 👍/👎 feedback, and the admin
JSONL fine-tuning export of liked, complete, untruncated answers (filterable
by model and level). Streaming the reply itself lives in chat_stream."""
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.ai.chat.base import ChatTurn
from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT, system_prompt_for
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

    def create_assistant_placeholder(
        self, conversation: ChatConversation, model: str, level: Optional[str] = None
    ) -> ChatMessage:
        message = ChatMessage(
            conversation_id=conversation.id,
            law_firm_id=conversation.law_firm_id,
            role=ChatRole.ASSISTANT,
            content="",
            status=ChatMessageStatus.STREAMING,
            model=model,
            level=level,
        )
        self.repo.save(message)
        return message

    def last_user_content(self, conversation: ChatConversation) -> Optional[str]:
        for message in reversed(self.repo.list_messages(conversation.id)):
            if message.role == ChatRole.USER:
                return message.content
        return None

    def build_history(
        self, conversation: ChatConversation, limit: int, system_prompt: str = CHAT_SYSTEM_PROMPT
    ) -> list[ChatTurn]:
        usable = [
            m
            for m in self.repo.list_messages(conversation.id)
            if m.role == ChatRole.USER or m.status == ChatMessageStatus.COMPLETE
        ]
        recent = usable[-limit:] if limit > 0 else usable
        return [{"role": "system", "content": system_prompt}] + [
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

    def export_jsonl(self, law_firm_id: str, model: Optional[str] = None, level: Optional[str] = None) -> str:
        """One OpenAI chat fine-tuning example per liked, complete, untruncated assistant
        message: system prompt + the conversation up to and including it."""
        query = self.db.query(ChatMessage).filter(
            ChatMessage.law_firm_id == law_firm_id,
            ChatMessage.role == ChatRole.ASSISTANT,
            ChatMessage.status == ChatMessageStatus.COMPLETE,
            ChatMessage.feedback == 1,
            or_(ChatMessage.truncated.is_(None), ChatMessage.truncated.is_(False)),  # cut-off replies aren't examples
        )
        if model:
            query = query.filter(ChatMessage.model == model)
        if level == "standard":
            query = query.filter(or_(ChatMessage.level == "standard", ChatMessage.level.is_(None)))
        elif level:
            query = query.filter(ChatMessage.level == level)
        lines: list[str] = []
        for target in query.order_by(ChatMessage.created_at.asc()).all():
            if not target.content.strip():
                continue  # OpenAI rejects empty content
            turns = [{"role": "system", "content": system_prompt_for(target.level)}]
            pending_user: Optional[ChatMessage] = None
            for message in self.repo.list_messages(target.conversation_id):
                if message.role == ChatRole.USER:
                    pending_user = message  # a newer user turn supersedes an unanswered one
                elif message.status == ChatMessageStatus.COMPLETE and pending_user is not None:
                    turns.append({"role": "user", "content": pending_user.content})
                    turns.append({"role": "assistant", "content": message.content})
                    pending_user = None
                else:
                    pending_user = None  # failed/stopped reply: drop the unanswered question
                if message.id == target.id:
                    break
            lines.append(json.dumps({"messages": turns}, ensure_ascii=False))
        return "".join(line + "\n" for line in lines)
