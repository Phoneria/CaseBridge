"""Calendar API (Takvim): merges calendar events, task due dates and case
hearing dates into one firm-wide chronological view."""
from datetime import date

RANGE_2026 = {"from": "2026-01-01", "to": "2026-12-31"}

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

    response = client.get("/calendar", params=RANGE_2026, headers=headers)
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

    response = client.get("/calendar", params=RANGE_2026, headers=headers)
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

    response = client.get("/calendar", params=RANGE_2026, headers=headers)
    dates = [e["date"] for e in response.json()]
    assert dates == sorted(dates)


def test_calendar_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a, case_number="2026/804")
    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-11-01"}, headers=headers_a)

    response = client.get("/calendar", params=RANGE_2026, headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []


def test_calendar_task_events_carry_task_id(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/803", next_hearing_date="2026-10-07")
    task = client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Delil listesi", "due_date": "2026-10-08"},
        headers=headers,
    ).json()

    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()

    task_event = next(e for e in body if e["event_type"] == "task")
    hearing_event = next(e for e in body if e["event_type"] == "hearing")
    assert task_event["task_id"] == task["id"]
    assert hearing_event["task_id"] is None


def _create_event(client, headers, **overrides):
    payload = {"title": "Müvekkil toplantısı", "event_type": "meeting", "starts_at": "2026-10-07T14:30:00", **overrides}
    response = client.post("/calendar/events", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def test_calendar_lists_events_with_the_unified_fields(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    case = _create_case(client, headers, case_number="2026/810")
    event = _create_event(
        client, headers, case_id=case["id"], assignee_id=fixtures["user_a"].id,
        duration_minutes=90, location="Büro", notes="Belgeleri getir", reminder_days=[3],
    )

    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()

    assert body == [
        {
            "id": f"event:{event['id']}",
            "kind": "event",
            "event_type": "meeting",
            "title": "Müvekkil toplantısı",
            "date": "2026-10-07",
            "start": "2026-10-07T14:30:00",
            "end": "2026-10-07T16:00:00",
            "all_day": False,
            "case_id": case["id"],
            "case_name": VALID_CASE_PAYLOAD["case_name"],
            "task_id": None,
            "event_id": event["id"],
            "assignee_id": fixtures["user_a"].id,
            "assignee_name": "Avukat A",
            "location": "Büro",
            "notes": "Belgeleri getir",
            "reminder_days": [3],
            "editable": True,
        }
    ]


def test_all_day_events_have_no_start_or_end(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _create_event(client, headers, all_day=True)

    item = client.get("/calendar", params=RANGE_2026, headers=headers).json()[0]

    assert (item["all_day"], item["start"], item["end"], item["case_id"]) == (True, None, None, None)


def test_task_and_hearing_items_carry_kind_assignee_and_default_reminders(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    case = _create_case(
        client, headers, case_number="2026/811", next_hearing_date="2026-10-09",
        assigned_lawyer_id=fixtures["user_a"].id,
    )
    task = client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Delil listesi", "due_date": "2026-10-08", "assigned_to": fixtures["user_a"].id},
        headers=headers,
    ).json()

    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
    task_item = next(item for item in body if item["kind"] == "task")
    hearing_item = next(item for item in body if item["kind"] == "case_hearing")

    assert task_item["id"] == f"task:{task['id']}"
    assert (task_item["event_type"], task_item["all_day"], task_item["editable"]) == ("task", True, False)
    assert task_item["reminder_days"] == [1]
    assert task_item["assignee_name"] == "Avukat A"
    assert hearing_item["id"] == f"hearing:{case['id']}"
    assert hearing_item["event_type"] == "hearing"
    assert hearing_item["title"] == f"Duruşma - {VALID_CASE_PAYLOAD['case_name']}"
    assert hearing_item["reminder_days"] == [3, 1]
    assert hearing_item["assignee_id"] == fixtures["user_a"].id
    assert hearing_item["location"] == VALID_CASE_PAYLOAD["court"]


def test_task_items_show_their_own_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/812")
    task = client.post(
        f"/cases/{case['id']}/tasks", json={"title": "Dilekçe", "due_date": "2026-10-08"}, headers=headers
    ).json()
    client.patch(f"/tasks/{task['id']}", json={"reminder_days": []}, headers=headers)

    item = client.get("/calendar", params=RANGE_2026, headers=headers).json()[0]

    assert item["reminder_days"] == []


def test_case_hearing_is_hidden_when_a_hearing_event_exists_that_day(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/813", next_hearing_date="2026-10-09")
    other_day = _create_case(client, headers, case_number="2026/814", next_hearing_date="2026-10-10")
    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case["id"], starts_at="2026-10-09T10:00:00")
    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=other_day["id"], starts_at="2026-10-11T10:00:00")

    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()

    assert [(item["kind"], item["case_id"], item["date"]) for item in body] == [
        ("event", case["id"], "2026-10-09"),
        ("case_hearing", other_day["id"], "2026-10-10"),
        ("event", other_day["id"], "2026-10-11"),
    ]


def test_calendar_filters_by_date_range(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _create_event(client, headers, title="Önce", starts_at="2026-09-30T23:30:00")
    _create_event(client, headers, title="İlk gün", starts_at="2026-10-01T00:00:00")
    _create_event(client, headers, title="Son gün", starts_at="2026-10-31T23:59:00")
    _create_event(client, headers, title="Sonra", starts_at="2026-11-01T00:00:00")

    body = client.get("/calendar", params={"from": "2026-10-01", "to": "2026-10-31"}, headers=headers).json()

    assert [item["title"] for item in body] == ["İlk gün", "Son gün"]


def test_calendar_default_range_is_31_days_back_and_62_days_ahead(client, two_firms_two_users, monkeypatch):
    monkeypatch.setattr("app.api.routes.calendar.local_today", lambda: date(2026, 10, 2))
    headers = _auth_headers(client, two_firms_two_users)
    for title, day in [("A", "2026-08-31"), ("B", "2026-09-01"), ("C", "2026-12-03"), ("D", "2026-12-04")]:
        _create_event(client, headers, title=title, starts_at=f"{day}T10:00:00")

    body = client.get("/calendar", headers=headers).json()

    assert [item["title"] for item in body] == ["B", "C"]


def test_calendar_sorts_all_day_items_before_timed_ones_within_a_day(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _create_event(client, headers, title="Öğleden sonra", starts_at="2026-10-07T15:00:00")
    _create_event(client, headers, title="Sabah", starts_at="2026-10-07T09:00:00")
    _create_event(client, headers, title="Tüm gün", all_day=True, starts_at="2026-10-07T00:00:00")

    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()

    assert [item["title"] for item in body] == ["Tüm gün", "Sabah", "Öğleden sonra"]


def test_calendar_rejects_inverted_or_too_long_ranges(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    inverted = client.get("/calendar", params={"from": "2026-10-31", "to": "2026-10-01"}, headers=headers)
    too_long = client.get("/calendar", params={"from": "2026-01-01", "to": "2027-12-31"}, headers=headers)
    assert (inverted.status_code, too_long.status_code) == (422, 422)


def test_calendar_events_are_isolated_by_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    _create_event(client, _auth_headers(client, fixtures, "user_a"))

    body = client.get("/calendar", params=RANGE_2026, headers=_auth_headers(client, fixtures, "user_b")).json()

    assert body == []
