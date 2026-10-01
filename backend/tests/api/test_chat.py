"""Chat assistant API (Hukuk Asistanı)."""
import json

import pytest

from app.ai.chat.mock_provider import MockChatProvider
from app.api.deps import get_chat_provider_dep, get_chat_session_factory
from app.services.chat_service import make_title


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _second_user_same_firm(db_session, fixtures):
    from app.core.security import hash_password
    from app.models.user import User, UserRole

    user = User(
        law_firm_id=fixtures["firm_a"].id,
        email="avukat.a2@demo.casebridge.dev",
        hashed_password=hash_password(fixtures["password"]),
        full_name="Avukat A2",
        role=UserRole.LAWYER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_chat_status_reports_mock_provider(client, two_firms_two_users):
    body = client.get("/chat/status", headers=_headers(client, two_firms_two_users)).json()
    assert body == {"provider": "mock", "model": "mock", "configured": True, "external": False, "error": None}


def test_create_list_rename_and_delete_conversation(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)

    created = client.post("/chat/conversations", headers=headers)
    assert created.status_code == 201
    conversation = created.json()
    assert conversation["title"] == "Yeni sohbet"
    assert conversation["messages"] == []

    listed = client.get("/chat/conversations", headers=headers).json()
    assert [c["id"] for c in listed] == [conversation["id"]]

    renamed = client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "  Kira hukuku  "}, headers=headers)
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Kira hukuku"

    assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "   "}, headers=headers).status_code == 422
    assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "x" * 121}, headers=headers).status_code == 422

    assert client.delete(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 204
    assert client.get(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404
    assert client.get("/chat/conversations", headers=headers).json() == []


def test_conversations_are_private_to_their_user(client, two_firms_two_users, db_session):
    fixtures = two_firms_two_users
    headers_a = _headers(client, fixtures, "user_a")
    conversation = client.post("/chat/conversations", headers=headers_a).json()

    colleague = _second_user_same_firm(db_session, fixtures)
    colleague_headers = {
        "Authorization": "Bearer "
        + client.post("/auth/login", json={"email": colleague.email, "password": fixtures["password"]}).json()["access_token"]
    }
    other_firm_headers = _headers(client, fixtures, "user_b")

    for headers in (colleague_headers, other_firm_headers):
        assert client.get("/chat/conversations", headers=headers).json() == []
        assert client.get(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404
        assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "x"}, headers=headers).status_code == 404
        assert client.delete(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404


def test_make_title_collapses_whitespace_and_truncates():
    assert make_title("  Kira   artışı\nnasıl hesaplanır? ") == "Kira artışı nasıl hesaplanır?"
    long = "a" * 70
    assert make_title(long) == "a" * 60 + "…"


@pytest.fixture()
def chat_provider(client, db_session):
    from app.main import app

    provider = MockChatProvider(model="gpt-test")
    app.dependency_overrides[get_chat_provider_dep] = lambda: provider
    app.dependency_overrides[get_chat_session_factory] = lambda: (lambda: db_session)
    yield provider
    app.dependency_overrides.pop(get_chat_provider_dep, None)
    app.dependency_overrides.pop(get_chat_session_factory, None)


def _send(client, headers, conversation_id, content):
    with client.stream(
        "POST", f"/chat/conversations/{conversation_id}/messages", json={"content": content}, headers=headers
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())
    return [json.loads(block[len("data: "):]) for block in raw.strip().split("\n\n")]


def test_send_message_streams_and_persists(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    events = _send(client, headers, conversation["id"], "  Kira   artışı nasıl hesaplanır? ")

    assert events[0]["type"] == "start"
    assert events[0]["user_message"]["role"] == "user"
    deltas = [e["text"] for e in events if e["type"] == "delta"]
    assert "".join(deltas).startswith("Bu, CaseBridge AI test yanıtıdır.")
    done = events[-1]
    assert done["type"] == "done"
    assert done["message"]["id"] == events[0]["assistant_message_id"]
    assert done["message"]["status"] == "complete"
    assert done["message"]["model"] == "gpt-test"

    stored = client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()
    assert stored["title"] == "Kira artışı nasıl hesaplanır?"
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant"]
    assert stored["messages"][1]["content"] == "".join(deltas)
    assert stored["messages"][1]["status"] == "complete"


def test_history_has_system_prompt_and_previous_turns(client, two_firms_two_users, chat_provider):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT

    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    _send(client, headers, conversation["id"], "İlk soru")
    _send(client, headers, conversation["id"], "İkinci soru")

    sent = chat_provider.calls[-1]
    assert sent[0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert [m["role"] for m in sent[1:]] == ["user", "assistant", "user"]
    assert sent[-1]["content"] == "İkinci soru"


def test_history_respects_limit(client, two_firms_two_users, chat_provider, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_history_limit", 2)
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    for question in ("Bir", "İki", "Üç"):
        _send(client, headers, conversation["id"], question)

    sent = chat_provider.calls[-1]
    assert len(sent) == 3  # system + last 2 messages
    assert sent[-1]["content"] == "Üç"


def test_provider_error_is_streamed_and_saved(client, two_firms_two_users, chat_provider):
    chat_provider._chunks = ["Kısmi ", "yanıt", "x"]
    chat_provider._fail_after = 2
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    events = _send(client, headers, conversation["id"], "Soru")

    assert events[-1] == {"type": "error", "message": "Mock sağlayıcı hatası."}
    stored = client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()
    assert stored["messages"][1]["status"] == "error"
    assert stored["messages"][1]["content"] == "Kısmi yanıt"


def test_send_message_validation_and_ownership(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    url = f"/chat/conversations/{conversation['id']}/messages"

    assert client.post(url, json={"content": "   "}, headers=headers).status_code == 422
    assert client.post(url, json={"content": "x" * 8001}, headers=headers).status_code == 422
    other = _headers(client, two_firms_two_users, "user_b")
    assert client.post(url, json={"content": "Soru"}, headers=other).status_code == 404


def test_send_message_returns_503_when_provider_misconfigured(client, two_firms_two_users, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    response = client.post(f"/chat/conversations/{conversation['id']}/messages", json={"content": "Soru"}, headers=headers)

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
    assert client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()["messages"] == []


def test_delete_conversation_removes_its_messages(client, two_firms_two_users, chat_provider, db_session):
    from app.models.chat import ChatMessage

    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    _send(client, headers, conversation["id"], "Soru")
    assert db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation["id"]).count() == 2

    assert client.delete(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 204

    db_session.expire_all()
    assert db_session.query(ChatMessage).filter(ChatMessage.conversation_id == conversation["id"]).count() == 0
