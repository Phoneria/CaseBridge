"""Reports (Phase 4 - Raporlar): CSV export of the firm's cases."""

VALID_CASE_PAYLOAD = {
    "case_number": "2026/901",
    "case_name": "Tazminat Davasi",
    "client_name": "Zeynep Aydin",
    "opposing_party": "Sigorta A.S.",
    "case_type": "diger",
    "court": "Bursa 2. Asliye Hukuk Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def test_cases_csv_export_includes_created_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)

    response = client.get("/reports/cases.csv", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "Tazminat Davasi" in response.text
    assert "case_number" in response.text.splitlines()[0]


def test_cases_csv_export_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers_a)

    response = client.get("/reports/cases.csv", headers=headers_b)
    assert "Tazminat Davasi" not in response.text
