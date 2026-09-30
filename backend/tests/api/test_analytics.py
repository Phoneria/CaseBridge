"""Analytics API (section 16, 22 - Analytics)."""


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers, **overrides):
    payload = {
        "case_number": "2026/501",
        "case_name": "Test Davasi",
        "client_name": "Test Musteri",
        "case_type": "is_hukuku",
        "status": "devam_eden",
    }
    payload.update(overrides)
    return client.post("/cases", json=payload, headers=headers).json()


def test_analytics_overview_empty_dataset(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = client.get("/analytics/overview", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_cases"] == 0
    assert body["win_rate"] == 0.0


def test_analytics_overview_reflects_created_cases(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    won = _create_case(client, headers, case_number="1")
    client.patch(f"/cases/{won['id']}", json={"status": "kapali", "outcome": "won"}, headers=headers)
    lost = _create_case(client, headers, case_number="2")
    client.patch(f"/cases/{lost['id']}", json={"status": "kapali", "outcome": "lost"}, headers=headers)

    response = client.get("/analytics/overview", headers=headers)
    body = response.json()
    assert body["total_cases"] == 2
    assert body["won_cases"] == 1
    assert body["lost_cases"] == 1
    assert body["win_rate"] == 50.0


def test_analytics_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    won = _create_case(client, headers_a, case_number="1")
    client.patch(f"/cases/{won['id']}", json={"status": "kapali", "outcome": "won"}, headers=headers_a)

    response_b = client.get("/analytics/overview", headers=headers_b)
    assert response_b.json()["total_cases"] == 0


def test_analytics_case_type_filter(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _create_case(client, headers, case_number="1", case_type="is_hukuku")
    _create_case(client, headers, case_number="2", case_type="kira")

    response = client.get("/analytics/overview", params={"case_type": "kira"}, headers=headers)
    assert response.json()["total_cases"] == 1


def test_analytics_overview_includes_status_breakdown(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    # created in reverse enum order so ordering can't come from insertion order
    _create_case(client, headers, case_number="2026/553", status="kapali")
    _create_case(client, headers, case_number="2026/551", status="devam_eden")
    _create_case(client, headers, case_number="2026/552", status="devam_eden")

    body = client.get("/analytics/overview", headers=headers).json()

    by_status = {row["status"]: row["total"] for row in body["by_status"]}
    assert by_status == {"devam_eden": 2, "kapali": 1}
    # stable CaseStatus declaration order (pie colours depend on it)
    assert [row["status"] for row in body["by_status"]] == ["devam_eden", "kapali"]


def test_overview_counts_match_case_list_filters(client, two_firms_two_users):
    """Spec 5.1: every analytics number must equal the row count of the
    list it links to (links from analytics always add include_archived)."""
    headers = _auth_headers(client, two_firms_two_users)
    won_archived = _create_case(client, headers, case_number="2026/601", case_type="icra")
    _create_case(client, headers, case_number="2026/602", case_type="icra")
    lost = _create_case(client, headers, case_number="2026/603", case_type="kira")
    _create_case(client, headers, case_number="2026/604", case_type="kira", status="karar_bekleyen")
    client.patch(f"/cases/{won_archived['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)
    client.patch(f"/cases/{lost['id']}", json={"outcome": "lost", "status": "kapali"}, headers=headers)
    client.post(f"/cases/{won_archived['id']}/archive", headers=headers)

    overview = client.get("/analytics/overview", headers=headers).json()

    def count(query: str) -> int:
        response = client.get(f"/cases?include_archived=true{query}", headers=headers)
        assert response.status_code == 200
        return len(response.json())

    assert overview["won_cases"] == 1  # the archived won case is counted
    assert overview["total_cases"] == count("")
    assert overview["active_cases"] == count("&active=true")
    assert overview["won_cases"] == count("&outcome=won")
    assert overview["lost_cases"] == count("&outcome=lost")
    for row in overview["by_category"]:
        assert row["total"] == count(f"&case_type={row['case_type']}")
    for row in overview["by_status"]:
        assert row["total"] == count(f"&status={row['status']}")
