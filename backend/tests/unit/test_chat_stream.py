"""stream_assistant_reply persists partial content as 'stopped' when the
client goes away mid-stream (the async generator is closed early)."""
import json

from app.ai.chat.mock_provider import MockChatProvider
from app.models.chat import ChatConversation, ChatMessage, ChatMessageStatus, ChatRole
from app.services.chat_stream import sse, stream_assistant_reply


def _seed(db_session):
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="F")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="u@x.dev", hashed_password="x", full_name="U", role=UserRole.LAWYER, is_active=True)
    db_session.add(user)
    db_session.flush()
    conversation = ChatConversation(law_firm_id=firm.id, user_id=user.id)
    db_session.add(conversation)
    db_session.flush()
    assistant = ChatMessage(
        conversation_id=conversation.id,
        law_firm_id=firm.id,
        role=ChatRole.ASSISTANT,
        content="",
        status=ChatMessageStatus.STREAMING,
        model="mock",
    )
    db_session.add(assistant)
    db_session.commit()
    return conversation, assistant


def test_sse_format():
    assert sse({"type": "delta", "text": "ğ"}) == 'data: {"type": "delta", "text": "ğ"}\n\n'


async def test_closing_the_stream_early_saves_stopped(db_session):
    conversation, assistant = _seed(db_session)
    provider = MockChatProvider(chunks=["Bir ", "iki ", "üç"])
    stream = stream_assistant_reply(
        provider=provider,
        history=[{"role": "user", "content": "x"}],
        start_event={"type": "start"},
        assistant_message_id=assistant.id,
        conversation_id=conversation.id,
        session_factory=lambda: db_session,
    )

    first = await stream.__anext__()
    assert json.loads(first[len("data: "):])["type"] == "start"
    second = await stream.__anext__()
    assert json.loads(second[len("data: "):]) == {"type": "delta", "text": "Bir "}
    await stream.aclose()

    db_session.expire_all()
    saved = db_session.get(ChatMessage, assistant.id)
    assert saved.status == ChatMessageStatus.STOPPED
    assert saved.content == "Bir "


async def _collect(stream):
    return [json.loads(chunk[len("data: "):]) async for chunk in stream]


def _stream(db_session, conversation, assistant, provider):
    return stream_assistant_reply(
        provider=provider,
        history=[{"role": "user", "content": "x"}],
        start_event={"type": "start"},
        assistant_message_id=assistant.id,
        conversation_id=conversation.id,
        session_factory=lambda: db_session,
    )


async def test_failed_final_persist_falls_back_to_stopped(db_session, monkeypatch):
    from app.services import chat_stream

    conversation, assistant = _seed(db_session)
    real_persist = chat_stream._persist

    def flaky(session_factory, message_id, conversation_id, content, status, usage, latency):
        if status != ChatMessageStatus.STOPPED:
            raise RuntimeError("db down")
        return real_persist(session_factory, message_id, conversation_id, content, status, usage, latency)

    monkeypatch.setattr(chat_stream, "_persist", flaky)
    events = await _collect(_stream(db_session, conversation, assistant, MockChatProvider(chunks=["Bir ", "iki"])))

    assert events[-1]["type"] == "error"
    assert all(event["type"] != "done" for event in events)
    db_session.expire_all()
    saved = db_session.get(ChatMessage, assistant.id)
    assert saved.status == ChatMessageStatus.STOPPED
    assert saved.content == "Bir iki"


async def test_deleted_message_emits_error_not_null_done(db_session):
    conversation, assistant = _seed(db_session)
    db_session.delete(assistant)
    db_session.commit()
    events = await _collect(_stream(db_session, conversation, assistant, MockChatProvider(chunks=["Bir"])))

    assert events[-1] == {"type": "error", "message": "Sohbet silindiği için yanıt kaydedilemedi."}
    assert all(event["type"] != "done" for event in events)
