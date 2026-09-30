"""Case management API (section 22 - Cases)."""
import pytest
from datetime import date, timedelta


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


VALID_CASE_PAYLOAD = {
    "case_number": "2026/101",
    "case_name": "İşçilik Alacakları Davası",
    "client_name": "Ahmet Yılmaz",
    "opposing_party": "ABC Lojistik A.Ş.",
    "case_type": "is_hukuku",
    "court": "İstanbul 5. İş Mahkemesi",
    "status": "devam_eden",
    "case_value": 150000.0,
    "description": "Fazla mesai ve kıdem tazminatı talebi.",
}


def test_create_case_success(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["case_number"] == "2026/101"
    assert body["status"] == "devam_eden"
    assert body["is_archived"] is False


def test_create_case_missing_required_field_fails(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    payload = dict(VALID_CASE_PAYLOAD)
    del payload["case_name"]
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 422


def test_get_case_detail(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    created = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()

    response = client.get(f"/cases/{created['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["case_name"] == VALID_CASE_PAYLOAD["case_name"]
    assert response.json()["timeline"] == []


def test_update_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    created = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()

    response = client.patch(
        f"/cases/{created['id']}", json={"status": "karar_bekleyen"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["status"] == "karar_bekleyen"


def test_archive_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    created = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()

    response = client.post(f"/cases/{created['id']}/archive", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_archived"] is True

    # Archived cases are excluded from the default list but still fetchable directly.
    list_response = client.get("/cases", headers=headers)
    ids_in_default_list = {c["id"] for c in list_response.json()}
    assert created["id"] not in ids_in_default_list

    detail_response = client.get(f"/cases/{created['id']}", headers=headers)
    assert detail_response.status_code == 200


def test_search_cases_by_client_name(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    other = dict(VALID_CASE_PAYLOAD)
    other["case_number"] = "2026/102"
    other["client_name"] = "Zeynep Kaya"
    other["case_name"] = "Kira Tespit Davası"
    client.post("/cases", json=other, headers=headers)

    response = client.get("/cases", params={"search": "Zeynep"}, headers=headers)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["client_name"] == "Zeynep Kaya"


def test_filter_cases_by_status(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    closed = dict(VALID_CASE_PAYLOAD)
    closed["case_number"] = "2026/103"
    closed["status"] = "kapali"
    client.post("/cases", json=closed, headers=headers)

    response = client.get("/cases", params={"status": "kapali"}, headers=headers)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["status"] == "kapali"


def test_filter_cases_by_type(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    rental = dict(VALID_CASE_PAYLOAD)
    rental["case_number"] = "2026/104"
    rental["case_type"] = "kira"
    client.post("/cases", json=rental, headers=headers)

    response = client.get("/cases", params={"case_type": "kira"}, headers=headers)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["case_type"] == "kira"


def test_duplicate_case_number_in_same_firm_is_rejected(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    assert response.status_code == 201

    response = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)
    assert response.status_code == 409


def test_same_case_number_allowed_across_different_firms(client, two_firms_two_users):
    headers_a = _auth_headers(client, two_firms_two_users, "user_a")
    headers_b = _auth_headers(client, two_firms_two_users, "user_b")

    response = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers_a)
    assert response.status_code == 201

    response = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers_b)
    assert response.status_code == 201


def test_list_cases_respects_limit_and_offset(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    for i in range(3):
        payload = {**VALID_CASE_PAYLOAD, "case_number": f"2026/{200 + i}"}
        client.post("/cases", json=payload, headers=headers)

    response = client.get("/cases", params={"limit": 2}, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/cases", params={"limit": 2, "offset": 2}, headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_cases_default_has_no_limit(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    for i in range(3):
        payload = {**VALID_CASE_PAYLOAD, "case_number": f"2026/{300 + i}"}
        client.post("/cases", json=payload, headers=headers)

    response = client.get("/cases", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_case_belongs_to_correct_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    created = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers_a).json()

    # Firm B cannot read, update, or archive firm A's case.
    assert client.get(f"/cases/{created['id']}", headers=headers_b).status_code == 404
    assert (
        client.patch(f"/cases/{created['id']}", json={"status": "kapali"}, headers=headers_b).status_code
        == 404
    )
    assert client.post(f"/cases/{created['id']}/archive", headers=headers_b).status_code == 404

    # Firm B's own case list does not include firm A's case.
    list_response = client.get("/cases", headers=headers_b)
    ids = {c["id"] for c in list_response.json()}
    assert created["id"] not in ids


def _create(client, headers, **overrides):
    payload = {**VALID_CASE_PAYLOAD, **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_filter_cases_by_outcome(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    won = _create(client, headers, case_number="2026/701")
    _create(client, headers, case_number="2026/702")
    client.patch(f"/cases/{won['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)

    response = client.get("/cases?outcome=won", headers=headers)

    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == [won["id"]]


def test_filter_cases_active_true_and_false(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    open_case = _create(client, headers, case_number="2026/711")
    closed_case = _create(client, headers, case_number="2026/712", status="kapali")

    active_ids = [c["id"] for c in client.get("/cases?active=true", headers=headers).json()]
    inactive_ids = [c["id"] for c in client.get("/cases?active=false", headers=headers).json()]

    assert active_ids == [open_case["id"]]
    assert inactive_ids == [closed_case["id"]]


def test_filter_cases_by_hearing_window_is_inclusive(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    today_case = _create(client, headers, case_number="2026/720", next_hearing_date=today.isoformat())
    soon = _create(client, headers, case_number="2026/721", next_hearing_date=(today + timedelta(days=3)).isoformat())
    edge = _create(client, headers, case_number="2026/722", next_hearing_date=(today + timedelta(days=30)).isoformat())
    _create(client, headers, case_number="2026/723", next_hearing_date=(today + timedelta(days=31)).isoformat())
    _create(client, headers, case_number="2026/724", next_hearing_date=(today - timedelta(days=1)).isoformat())
    _create(client, headers, case_number="2026/725")

    response = client.get("/cases?hearing_within_days=30", headers=headers)

    assert response.status_code == 200
    assert {c["id"] for c in response.json()} == {today_case["id"], soon["id"], edge["id"]}


def test_hearing_window_rejects_out_of_range_values(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    assert client.get("/cases?hearing_within_days=0", headers=headers).status_code == 422
    assert client.get("/cases?hearing_within_days=366", headers=headers).status_code == 422
