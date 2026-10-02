"""Chat assistant API (Hukuk Asistanı)."""
import json

import pytest

from app.ai.chat.mock_provider import MockChatProvider
from app.api.deps import get_chat_provider_resolver, get_chat_session_factory
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
    assert body == {
        "provider": "mock",
        "model": "mock",
        "configured": True,
        "external": False,
        "error": None,
        "levels": [
            {"level": "basic", "label": "Basit", "model": "mock"},
            {"level": "standard", "label": "Standart", "model": "mock"},
            {"level": "deep", "label": "Kapsamlı", "model": "mock"},
        ],
    }


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
    missing = client.get(f"/chat/conversations/{conversation['id']}", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Sohbet bulunamadı."
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
    provider.requested_levels = []

    def resolve(level):
        provider.requested_levels.append(level)
        return provider

    app.dependency_overrides[get_chat_provider_resolver] = lambda: resolve
    app.dependency_overrides[get_chat_session_factory] = lambda: (lambda: db_session)
    yield provider
    app.dependency_overrides.pop(get_chat_provider_resolver, None)
    app.dependency_overrides.pop(get_chat_session_factory, None)


def _send(client, headers, conversation_id, content, level=None):
    body = {"content": content} if level is None else {"content": content, "level": level}
    with client.stream(
        "POST", f"/chat/conversations/{conversation_id}/messages", json=body, headers=headers
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
    assert response.json()["detail"] == "Sohbet modeli yapılandırılmamış."
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


def _make_admin(db_session, fixtures):
    from app.models.user import UserRole

    admin = fixtures["user_a"]
    admin.role = UserRole.ADMIN
    db_session.commit()
    return admin


def test_feedback_on_complete_assistant_messages(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    other = _headers(client, two_firms_two_users, "user_b")  # before streaming: the stream closes the shared test session
    conversation = client.post("/chat/conversations", headers=headers).json()
    events = _send(client, headers, conversation["id"], "Soru")
    assistant_id = events[-1]["message"]["id"]
    user_message_id = events[0]["user_message"]["id"]

    liked = client.put(f"/chat/messages/{assistant_id}/feedback", json={"value": 1}, headers=headers)
    assert liked.status_code == 200
    assert liked.json()["feedback"] == 1

    cleared = client.put(f"/chat/messages/{assistant_id}/feedback", json={"value": 0}, headers=headers)
    assert cleared.json()["feedback"] is None

    assert client.put(f"/chat/messages/{assistant_id}/feedback", json={"value": 2}, headers=headers).status_code == 422
    assert client.put(f"/chat/messages/{user_message_id}/feedback", json={"value": 1}, headers=headers).status_code == 422
    foreign = client.put(f"/chat/messages/{assistant_id}/feedback", json={"value": 1}, headers=other)
    assert foreign.status_code == 404
    assert foreign.json()["detail"] == "Mesaj bulunamadı."


def test_export_requires_admin(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    assert client.get("/chat/export.jsonl", headers=headers).status_code == 403


def test_export_contains_liked_answers_in_openai_format(client, two_firms_two_users, chat_provider, db_session):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT

    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    first = _send(client, headers, conversation["id"], "İlk soru")[-1]["message"]
    second = _send(client, headers, conversation["id"], "İkinci soru")[-1]["message"]
    client.put(f"/chat/messages/{second['id']}/feedback", json={"value": 1}, headers=headers)
    client.put(f"/chat/messages/{first['id']}/feedback", json={"value": -1}, headers=headers)

    response = client.get("/chat/export.jsonl", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/jsonl; charset=utf-8"
    assert "attachment" in response.headers["content-disposition"]
    lines = [json.loads(line) for line in response.text.splitlines() if line.strip()]
    assert len(lines) == 1
    messages = lines[0]["messages"]
    assert messages[0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert [m["role"] for m in messages[1:]] == ["user", "assistant", "user", "assistant"]
    assert messages[-1]["content"] == second["content"]
    assert "İkinci soru" in response.text  # ensure_ascii=False

    assert client.get("/chat/export.jsonl?model=other-model", headers=headers).text == ""


def test_export_is_scoped_to_the_admins_firm(client, two_firms_two_users, chat_provider, db_session):
    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers_a = _headers(client, fixtures, "user_a")  # before streaming: the stream closes the shared test session
    headers_b = _headers(client, fixtures, "user_b")
    conversation = client.post("/chat/conversations", headers=headers_b).json()
    answer = _send(client, headers_b, conversation["id"], "Soru")[-1]["message"]
    client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers_b)

    assert client.get("/chat/export.jsonl", headers=headers_a).text == ""


def test_export_keeps_only_answered_turns(client, two_firms_two_users, chat_provider, db_session):
    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    chat_provider._fail_after = 0
    _send(client, headers, conversation["id"], "Cevapsız soru")
    chat_provider._fail_after = None
    answer = _send(client, headers, conversation["id"], "Cevaplanan soru")[-1]["message"]
    client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)

    lines = [json.loads(line) for line in client.get("/chat/export.jsonl", headers=headers).text.splitlines()]

    assert len(lines) == 1
    messages = lines[0]["messages"]
    assert [m["role"] for m in messages] == ["system", "user", "assistant"]
    assert messages[1]["content"] == "Cevaplanan soru"
    assert messages[2]["content"] == answer["content"]


def test_export_skips_blank_liked_answers(client, two_firms_two_users, chat_provider, db_session):
    from app.models.chat import ChatMessage

    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    answer = _send(client, headers, conversation["id"], "Soru")[-1]["message"]
    client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)
    db_session.query(ChatMessage).filter(ChatMessage.id == answer["id"]).update({"content": "  "})
    db_session.commit()

    assert client.get("/chat/export.jsonl", headers=headers).text == ""


def test_send_defaults_to_standard_level(client, two_firms_two_users, chat_provider):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT

    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    events = _send(client, headers, conversation["id"], "Soru")

    assert chat_provider.requested_levels == ["standard"]
    assert chat_provider.calls[-1][0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert events[-1]["message"]["level"] == "standard"
    assert events[-1]["message"]["model"] == "gpt-test"


def test_basic_level_sends_short_history_and_instruction(client, two_firms_two_users, chat_provider, monkeypatch):
    from app.ai.chat.prompt import system_prompt_for
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_history_limit_basic", 2)
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    for question in ("Bir", "İki", "Üç"):
        events = _send(client, headers, conversation["id"], question, level="basic")

    sent = chat_provider.calls[-1]
    assert sent[0] == {"role": "system", "content": system_prompt_for("basic")}
    assert len(sent) == 3  # system + last 2 messages
    assert sent[-1]["content"] == "Üç"
    assert chat_provider.requested_levels == ["basic", "basic", "basic"]
    assert events[-1]["message"]["level"] == "basic"
    stored = client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()["messages"]
    assert [m["level"] for m in stored if m["role"] == "assistant"] == ["basic", "basic", "basic"]
    assert all(m["level"] is None for m in stored if m["role"] == "user")


def test_send_rejects_unknown_level(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    response = client.post(
        f"/chat/conversations/{conversation['id']}/messages",
        json={"content": "Soru", "level": "expert"},
        headers=headers,
    )
    assert response.status_code == 422
    assert chat_provider.requested_levels == []


def test_export_uses_each_answers_level_prompt_and_filters_by_level(client, two_firms_two_users, chat_provider, db_session):
    from app.ai.chat.prompt import system_prompt_for

    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    basic = _send(client, headers, conversation["id"], "Kısa soru", level="basic")[-1]["message"]
    deep = _send(client, headers, conversation["id"], "Uzun soru", level="deep")[-1]["message"]
    for answer in (basic, deep):
        client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)

    lines = [json.loads(line) for line in client.get("/chat/export.jsonl", headers=headers).text.splitlines()]
    assert [line["messages"][0]["content"] for line in lines] == [system_prompt_for("basic"), system_prompt_for("deep")]

    deep_only = client.get("/chat/export.jsonl?level=deep", headers=headers).text.splitlines()
    assert len(deep_only) == 1
    assert json.loads(deep_only[0])["messages"][-1]["content"] == deep["content"]
    assert client.get("/chat/export.jsonl?level=standard", headers=headers).text == ""
    assert client.get("/chat/export.jsonl?level=expert", headers=headers).status_code == 422


def test_export_standard_includes_liked_answers_saved_without_level(client, two_firms_two_users, chat_provider, db_session):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT
    from app.models.chat import ChatMessage

    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    answer = _send(client, headers, conversation["id"], "Eski soru")[-1]["message"]
    client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)
    db_session.query(ChatMessage).filter(ChatMessage.id == answer["id"]).update({"level": None})
    db_session.commit()

    lines = client.get("/chat/export.jsonl?level=standard", headers=headers).text.splitlines()

    assert len(lines) == 1
    messages = json.loads(lines[0])["messages"]
    assert messages[0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert messages[-1]["content"] == answer["content"]


def test_truncated_answer_is_flagged_and_not_exported(client, two_firms_two_users, chat_provider, db_session):
    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    chat_provider._finish_reason = "length"
    answer = _send(client, headers, conversation["id"], "Uzun soru")[-1]["message"]
    chat_provider._finish_reason = None

    assert answer["truncated"] is True
    liked = client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)
    assert liked.status_code == 200
    reloaded = client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()
    assert reloaded["messages"][-1]["truncated"] is True
    assert client.get("/chat/export.jsonl", headers=headers).text == ""
