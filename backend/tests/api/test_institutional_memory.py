"""Institutional Memory (section 17, 22 - Institutional Memory)."""


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def test_search_cases_by_keyword_in_description(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post(
        "/cases",
        json={
            "case_number": "1",
            "case_name": "Genel Dava",
            "client_name": "Musteri A",
            "case_type": "sozlesme",
            "status": "devam_eden",
            "description": "Bu davada fazla mesai alacagi talep edilmektedir.",
        },
        headers=headers,
    )
    client.post(
        "/cases",
        json={
            "case_number": "2",
            "case_name": "Diger Dava",
            "client_name": "Musteri B",
            "case_type": "sozlesme",
            "status": "devam_eden",
            "description": "Kira bedelinin tespiti talep edilmektedir.",
        },
        headers=headers,
    )

    response = client.get("/cases", params={"search": "fazla mesai"}, headers=headers)
    results = response.json()
    assert len(results) == 1
    assert results[0]["case_name"] == "Genel Dava"


def test_search_cases_by_assigned_lawyer(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    lawyer_id = fixtures["user_a"].id

    client.post(
        "/cases",
        json={
            "case_number": "1",
            "case_name": "Atanan Dava",
            "client_name": "M",
            "case_type": "diger",
            "status": "devam_eden",
            "assigned_lawyer_id": lawyer_id,
        },
        headers=headers,
    )
    client.post(
        "/cases",
        json={"case_number": "2", "case_name": "Atanmamis Dava", "client_name": "M", "case_type": "diger", "status": "devam_eden"},
        headers=headers,
    )

    response = client.get("/cases", params={"assigned_lawyer_id": lawyer_id}, headers=headers)
    results = response.json()
    assert len(results) == 1
    assert results[0]["case_name"] == "Atanan Dava"


def test_archived_cases_remain_searchable_with_include_archived(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    created = client.post(
        "/cases",
        json={
            "case_number": "1",
            "case_name": "Arsivlenecek Dava",
            "client_name": "M",
            "case_type": "diger",
            "status": "kapali",
        },
        headers=headers,
    ).json()
    client.post(f"/cases/{created['id']}/archive", headers=headers)

    default_response = client.get("/cases", params={"search": "Arsivlenecek"}, headers=headers)
    assert default_response.json() == []

    with_archived_response = client.get(
        "/cases", params={"search": "Arsivlenecek", "include_archived": True}, headers=headers
    )
    results = with_archived_response.json()
    assert len(results) == 1
    assert results[0]["is_archived"] is True


def test_closed_historical_case_outcome_is_retrievable(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    created = client.post(
        "/cases",
        json={
            "case_number": "1",
            "case_name": "Gecmis Dava",
            "client_name": "M",
            "case_type": "diger",
            "status": "kapali",
        },
        headers=headers,
    ).json()
    client.patch(f"/cases/{created['id']}", json={"outcome": "won"}, headers=headers)

    response = client.get(f"/cases/{created['id']}", headers=headers)
    assert response.json()["outcome"] == "won"
