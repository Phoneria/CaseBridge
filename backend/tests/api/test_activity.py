"""Firm-wide activity feed (Phase 4 - Dashboard "Son Gelismeler")."""

VALID_CASE_PAYLOAD = {
    "case_number": "2026/801",
    "case_name": "Kira Tespit Davasi",
    "client_name": "Mehmet Demir",
    "opposing_party": "Ev Sahibi A.S.",
    "case_type": "kira",
    "court": "Izmir 5. Sulh Hukuk Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers):
    return client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()


def test_activity_feed_includes_recent_case_events(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-01-12", "title": "Dava acildi", "event_type": "filing"},
        headers=headers,
    )

    response = client.get("/activity", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Dava acildi"
    assert body[0]["case_name"] == VALID_CASE_PAYLOAD["case_name"]


def test_activity_feed_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-01-12", "title": "Dava acildi", "event_type": "filing"},
        headers=headers_a,
    )

    response = client.get("/activity", headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []


def test_activity_feed_respects_limit(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    for i in range(3):
        client.post(
            f"/cases/{case['id']}/events",
            json={"event_date": "2026-01-12", "title": f"Gelisme {i}", "event_type": "other"},
            headers=headers,
        )

    response = client.get("/activity", params={"limit": 2}, headers=headers)
    assert len(response.json()) == 2
