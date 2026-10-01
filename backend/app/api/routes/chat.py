"""Chat assistant API (Hukuk Asistanı). Conversations are private to their
author: every lookup is scoped by law_firm_id AND user_id, and a miss is 404."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.ai.chat.factory import get_chat_provider_status
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import (
    ChatConversationOut,
    ChatConversationRename,
    ChatConversationSummaryOut,
    ChatMessageOut,
    ChatStatusOut,
)
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


def _owned_conversation_or_404(service: ChatService, conversation_id: str, user: User):
    conversation = service.get_conversation(conversation_id, user.law_firm_id, user.id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


def _conversation_out(service: ChatService, conversation) -> ChatConversationOut:
    return ChatConversationOut(
        id=conversation.id,
        title=conversation.title,
        updated_at=conversation.updated_at,
        messages=[ChatMessageOut.model_validate(m) for m in service.messages(conversation)],
    )


@router.get("/status", response_model=ChatStatusOut)
def chat_status(current_user: User = Depends(get_current_user)):
    return ChatStatusOut(**get_chat_provider_status())


@router.get("/conversations", response_model=list[ChatConversationSummaryOut])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ChatService(db).list_conversations(current_user.law_firm_id, current_user.id)


@router.post("/conversations", response_model=ChatConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ChatService(db)
    conversation = service.create_conversation(current_user.law_firm_id, current_user.id)
    return _conversation_out(service, conversation)


@router.get("/conversations/{conversation_id}", response_model=ChatConversationOut)
def get_conversation(
    conversation_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service = ChatService(db)
    return _conversation_out(service, _owned_conversation_or_404(service, conversation_id, current_user))


@router.patch("/conversations/{conversation_id}", response_model=ChatConversationSummaryOut)
def rename_conversation(
    conversation_id: str,
    payload: ChatConversationRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ChatService(db)
    conversation = _owned_conversation_or_404(service, conversation_id, current_user)
    return service.rename(conversation, payload.title)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service = ChatService(db)
    service.delete(_owned_conversation_or_404(service, conversation_id, current_user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
