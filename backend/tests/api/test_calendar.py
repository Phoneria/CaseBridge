"""Calendar API (Phase 4 - Takvim): merges case hearing dates and
task due dates into one firm-wide chronological view."""

VALID_CASE_PAYLOAD = {
    "case_number": "2026/801",
    "case_name": "Bosanma Davasi",
    "client_name": "Zeynep Demir",
    "opposing_party": "Mehmet Demir",
    "case_type": "is_hukuku",
    "court": "Istanbul 2. Aile Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers, **overrides):
    payload = {**VALID_CASE_PAYLOAD, **overrides}
    return client.post("/cases", json=payload, headers=headers).json()


def test_calendar_includes_case_hearing_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-10-05"}, headers=headers)

    response = client.get("/calendar", headers=headers)
    assert response.status_code == 200
    body = response.json()
    hearing_events = [e for e in body if e["event_type"] == "hearing"]
    assert len(hearing_events) == 1
    assert hearing_events[0]["date"] == "2026-10-05"
    assert hearing_events[0]["case_name"] == VALID_CASE_PAYLOAD["case_name"]


def test_calendar_includes_task_due_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/802")
    client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Dilekce hazirla", "due_date": "2026-09-20"},
        headers=headers,
    )

    response = client.get("/calendar", headers=headers)
    assert response.status_code == 200
    body = response.json()
    task_events = [e for e in body if e["event_type"] == "task"]
    assert len(task_events) == 1
    assert task_events[0]["date"] == "2026-09-20"
    assert task_events[0]["title"] == "Dilekce hazirla"


def test_calendar_sorted_chronologically(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/803")
    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-12-01"}, headers=headers)
    client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Erken gorev", "due_date": "2026-09-01"},
        headers=headers,
    )

    response = client.get("/calendar", headers=headers)
    dates = [e["date"] for e in response.json()]
    assert dates == sorted(dates)


def test_calendar_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a, case_number="2026/804")
    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-11-01"}, headers=headers_a)

    response = client.get("/calendar", headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []
