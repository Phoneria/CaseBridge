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
