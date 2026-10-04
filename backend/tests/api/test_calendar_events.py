"""Calendar events API: CRUD, firm isolation, case/assignee validation,
reminder_days rules and the hearing -> next_hearing_date sync."""
import pytest

CASE_PAYLOAD = {
    "case_number": "2026/901",
    "case_name": "Ticari Kira Uyarlama Davası",
    "client_name": "Deniz Arslan",
    "case_type": "kira",
    "status": "devam_eden",
}


def _auth_headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_case(client, headers, **overrides):
    response = client.post("/cases", json={**CASE_PAYLOAD, **overrides}, headers=headers)
    assert response.status_code == 201
    return response.json()


def _create_event(client, headers, **overrides):
    payload = {"title": "Müvekkil toplantısı", "event_type": "meeting", "starts_at": "2099-03-10T14:30:00", **overrides}
    return client.post("/calendar/events", json=payload, headers=headers)


def test_create_event_returns_201_with_defaults(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)

    response = _create_event(client, headers)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Müvekkil toplantısı"
    assert body["event_type"] == "meeting"
    assert body["starts_at"] == "2099-03-10T14:30:00"
    assert body["all_day"] is False
    assert body["duration_minutes"] == 60
    assert body["reminder_days"] == [1]
    assert body["created_by"] == fixtures["user_a"].id
    assert body["case_id"] is None and body["assignee_id"] is None


def test_hearing_events_default_to_three_and_one_day_reminders(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = _create_event(client, headers, title="Duruşma", event_type="hearing")
    assert response.json()["reminder_days"] == [3, 1]


def test_reminder_days_are_deduplicated_and_sorted_and_can_be_empty(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    assert _create_event(client, headers, reminder_days=[1, 7, 0, 1]).json()["reminder_days"] == [7, 1, 0]
    assert _create_event(client, headers, reminder_days=[]).json()["reminder_days"] == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"reminder_days": [31]},
        {"reminder_days": [-1]},
        {"title": "   "},
        {"title": "x" * 201},
        {"duration_minutes": 4},
        {"duration_minutes": 1441},
        {"event_type": "party"},
        {"location": "x" * 201},
    ],
)
def test_invalid_event_payloads_are_rejected(client, two_firms_two_users, overrides):
    headers = _auth_headers(client, two_firms_two_users)
    assert _create_event(client, headers, **overrides).status_code == 422


def test_all_day_events_are_stored_at_midnight(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    body = _create_event(client, headers, all_day=True, starts_at="2099-03-10T14:30:00").json()
    assert body["starts_at"] == "2099-03-10T00:00:00"


def test_aware_start_times_are_converted_to_app_timezone(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    body = _create_event(client, headers, starts_at="2099-03-10T07:30:00Z").json()
    assert body["starts_at"] == "2099-03-10T10:30:00"  # Europe/Istanbul is UTC+3


def test_event_can_link_a_case_and_an_assignee_of_the_same_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    case = _create_case(client, headers)

    body = _create_event(client, headers, case_id=case["id"], assignee_id=fixtures["user_a"].id).json()

    assert body["case_id"] == case["id"]
    assert body["assignee_id"] == fixtures["user_a"].id


def test_case_or_assignee_from_another_firm_is_404(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    other_case = _create_case(client, headers_b)

    by_case = _create_event(client, headers_a, case_id=other_case["id"])
    by_user = _create_event(client, headers_a, assignee_id=fixtures["user_b"].id)

    assert (by_case.status_code, by_case.json()["detail"]) == (404, "Dava bulunamadı")
    assert (by_user.status_code, by_user.json()["detail"]) == (404, "Kullanıcı bulunamadı")


def test_get_patch_and_delete_an_event(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    event = _create_event(client, headers).json()

    assert client.get(f"/calendar/events/{event['id']}", headers=headers).json()["title"] == "Müvekkil toplantısı"

    patched = client.patch(
        f"/calendar/events/{event['id']}",
        json={"title": "Bilirkişi görüşmesi", "reminder_days": [3], "location": "Büro"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Bilirkişi görüşmesi"
    assert patched.json()["reminder_days"] == [3]
    assert patched.json()["location"] == "Büro"
    assert patched.json()["starts_at"] == "2099-03-10T14:30:00"

    assert client.delete(f"/calendar/events/{event['id']}", headers=headers).status_code == 204
    assert client.get(f"/calendar/events/{event['id']}", headers=headers).status_code == 404


def test_patch_rejects_null_for_required_fields_and_foreign_case(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    event = _create_event(client, headers_a).json()
    other_case = _create_case(client, headers_b)

    assert client.patch(f"/calendar/events/{event['id']}", json={"title": None}, headers=headers_a).status_code == 422
    assert client.patch(f"/calendar/events/{event['id']}", json={"reminder_days": None}, headers=headers_a).status_code == 422
    response = client.patch(f"/calendar/events/{event['id']}", json={"case_id": other_case["id"]}, headers=headers_a)
    assert response.status_code == 404


def test_events_are_isolated_by_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    event = _create_event(client, headers_a).json()

    assert client.get(f"/calendar/events/{event['id']}", headers=headers_b).status_code == 404
    assert client.patch(f"/calendar/events/{event['id']}", json={"title": "X"}, headers=headers_b).status_code == 404
    assert client.delete(f"/calendar/events/{event['id']}", headers=headers_b).status_code == 404
    assert client.get(f"/calendar/events/{event['id']}", headers=headers_a).status_code == 200


def test_event_endpoints_require_login(client):
    assert client.post("/calendar/events", json={}).status_code == 401
    assert client.get("/calendar/events/x").status_code == 401


# ----- hearing events keep the case's next_hearing_date in sync -----


def _hearing(client, headers, case_id, starts_at):
    response = _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case_id, starts_at=starts_at)
    assert response.status_code == 201
    return response.json()


def _next_hearing(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["next_hearing_date"]


def test_hearing_event_sets_an_empty_next_hearing_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
    assert _next_hearing(client, headers, case["id"]) == "2099-05-10"


def test_hearing_event_moves_a_later_next_hearing_date_earlier_only(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    later = _create_case(client, headers, case_number="2026/902", next_hearing_date="2099-06-01")
    earlier = _create_case(client, headers, case_number="2026/903", next_hearing_date="2099-05-01")

    _hearing(client, headers, later["id"], "2099-05-10T10:00:00")
    _hearing(client, headers, earlier["id"], "2099-05-10T10:00:00")

    assert _next_hearing(client, headers, later["id"]) == "2099-05-10"
    assert _next_hearing(client, headers, earlier["id"]) == "2099-05-01"


def test_past_hearings_and_other_event_types_do_not_touch_the_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _hearing(client, headers, case["id"], "2000-01-10T10:00:00")
    _create_event(client, headers, case_id=case["id"], event_type="meeting", starts_at="2099-05-10T10:00:00")
    assert _next_hearing(client, headers, case["id"]) is None


def test_moving_a_hearing_event_earlier_updates_the_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")

    response = client.patch(f"/calendar/events/{event['id']}", json={"starts_at": "2099-04-20T09:00:00"}, headers=headers)

    assert response.status_code == 200
    assert _next_hearing(client, headers, case["id"]) == "2099-04-20"


def _phantom_hearing_days(client, headers, case_id):
    items = client.get("/calendar?from=2099-01-01&to=2099-12-31", headers=headers).json()
    return [item["date"] for item in items if item["id"] == f"hearing:{case_id}"]


def test_moving_a_hearing_event_later_moves_the_case_date_and_leaves_no_phantom(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")

    response = client.patch(f"/calendar/events/{event['id']}", json={"starts_at": "2099-06-20T09:00:00"}, headers=headers)

    assert response.status_code == 200
    assert _next_hearing(client, headers, case["id"]) == "2099-06-20"
    assert "2099-05-10" not in _phantom_hearing_days(client, headers, case["id"])


def test_deleting_the_only_hearing_event_clears_the_case_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")

    assert client.delete(f"/calendar/events/{event['id']}", headers=headers).status_code == 204

    assert _next_hearing(client, headers, case["id"]) is None
    assert _phantom_hearing_days(client, headers, case["id"]) == []


def test_deleting_one_of_two_hearing_events_falls_back_to_the_other(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    first = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
    _hearing(client, headers, case["id"], "2099-07-01T10:00:00")

    assert client.delete(f"/calendar/events/{first['id']}", headers=headers).status_code == 204

    assert _next_hearing(client, headers, case["id"]) == "2099-07-01"


def test_changing_a_hearing_to_a_meeting_clears_or_recomputes_the_case_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    only = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
    client.patch(f"/calendar/events/{only['id']}", json={"event_type": "meeting"}, headers=headers)
    assert _next_hearing(client, headers, case["id"]) is None

    other_case = _create_case(client, headers, case_number="2026/904")
    early = _hearing(client, headers, other_case["id"], "2099-05-10T10:00:00")
    _hearing(client, headers, other_case["id"], "2099-08-01T10:00:00")
    client.patch(f"/calendar/events/{early['id']}", json={"event_type": "meeting"}, headers=headers)
    assert _next_hearing(client, headers, other_case["id"]) == "2099-08-01"


def test_moving_a_hearing_event_to_another_case_recomputes_old_and_sets_new(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    old_case = _create_case(client, headers)
    new_case = _create_case(client, headers, case_number="2026/905")
    event = _hearing(client, headers, old_case["id"], "2099-05-10T10:00:00")

    response = client.patch(f"/calendar/events/{event['id']}", json={"case_id": new_case["id"]}, headers=headers)

    assert response.status_code == 200
    assert _next_hearing(client, headers, old_case["id"]) is None
    assert _next_hearing(client, headers, new_case["id"]) == "2099-05-10"


def test_a_case_date_that_differs_from_the_events_old_day_is_left_alone(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, next_hearing_date="2099-04-01")
    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"

    client.patch(f"/calendar/events/{event['id']}", json={"starts_at": "2099-06-20T09:00:00"}, headers=headers)
    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"
    client.delete(f"/calendar/events/{event['id']}", headers=headers)
    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"


def test_patch_with_an_assignee_from_another_firm_is_404_and_changes_nothing(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    event = _create_event(client, headers, assignee_id=fixtures["user_a"].id).json()

    response = client.patch(
        f"/calendar/events/{event['id']}",
        json={"assignee_id": fixtures["user_b"].id, "title": "Değişti"},
        headers=headers,
    )

    assert (response.status_code, response.json()["detail"]) == (404, "Kullanıcı bulunamadı")
    after = client.get(f"/calendar/events/{event['id']}", headers=headers).json()
    assert after["assignee_id"] == fixtures["user_a"].id
    assert after["title"] == "Müvekkil toplantısı"
