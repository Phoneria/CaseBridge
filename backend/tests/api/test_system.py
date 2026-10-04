"""System status (Phase 4 - Ayarlar AI durumu). Never leaks secret
values, mock provider by default in tests."""


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def test_ai_status_reports_mock_provider_by_default(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = client.get("/system/ai-status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "mock"
    assert body["configured"] is True


def test_ai_status_requires_authentication(client):
    response = client.get("/system/ai-status")
    assert response.status_code == 401


def test_ai_connectivity_mock_is_not_connected(client, two_firms_two_users):
    from app.ai.connectivity import reset_cache

    reset_cache()
    headers = _auth_headers(client, two_firms_two_users)
    response = client.get("/system/ai-connectivity", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is False
    assert {c["name"] for c in body["checks"]} == {"Analiz", "Hukuk Asistanı"}
    assert all(c["provider"] == "mock" and c["reachable"] is False for c in body["checks"])


def test_ai_connectivity_ollama_reachable(client, two_firms_two_users, monkeypatch):
    import httpx

    from app.ai import connectivity
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "chat_provider", "ollama")
    monkeypatch.setattr(settings, "chat_model", settings.ollama_model)

    def fake_get(url, **kwargs):
        return httpx.Response(200, json={"models": [{"name": settings.ollama_model}]}, request=httpx.Request("GET", url))

    monkeypatch.setattr(connectivity.httpx, "get", fake_get)
    connectivity.reset_cache()
    headers = _auth_headers(client, two_firms_two_users)
    body = client.get("/system/ai-connectivity", headers=headers).json()
    assert body["connected"] is True


def test_ai_connectivity_ollama_down(client, two_firms_two_users, monkeypatch):
    import httpx

    from app.ai import connectivity
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "chat_provider", "mock")

    def fake_get(url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(connectivity.httpx, "get", fake_get)
    connectivity.reset_cache()
    headers = _auth_headers(client, two_firms_two_users)
    body = client.get("/system/ai-connectivity", headers=headers).json()
    assert body["connected"] is False
    assert body["checks"][0]["detail"] == "Ollama sunucusuna ulaşılamadı."


def test_ai_connectivity_requires_authentication(client):
    assert client.get("/system/ai-connectivity").status_code == 401


def test_ai_usage_default_has_no_budget(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    body = client.get("/system/ai-usage", headers=headers).json()
    assert body["used_tokens"] == 0
    assert body["budget_tokens"] is None
    assert body["remaining_percent"] is None
    assert body["unlimited"] is False


def test_ai_usage_remaining_percent_with_budget(client, two_firms_two_users, db_session, monkeypatch):
    from app.core.config import settings
    from app.models.chat import ChatConversation, ChatMessage, ChatRole

    firm_id = two_firms_two_users["user_a"].law_firm_id
    monkeypatch.setattr(settings, "ai_monthly_token_budget", 1000)
    monkeypatch.setattr(settings, "chat_provider", "openai")
    conv = ChatConversation(law_firm_id=firm_id, user_id=two_firms_two_users["user_a"].id, title="t")
    db_session.add(conv)
    db_session.flush()
    db_session.add(ChatMessage(conversation_id=conv.id, law_firm_id=firm_id, role=ChatRole.ASSISTANT,
                               content="x", prompt_tokens=150, completion_tokens=100))
    db_session.commit()

    headers = _auth_headers(client, two_firms_two_users)
    body = client.get("/system/ai-usage", headers=headers).json()
    assert body["used_tokens"] == 250
    assert body["remaining_percent"] == 75.0
    assert body["unlimited"] is False


def test_ai_usage_requires_authentication(client):
    assert client.get("/system/ai-usage").status_code == 401
