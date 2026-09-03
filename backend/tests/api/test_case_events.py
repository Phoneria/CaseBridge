"""Case timeline / gelişmeler (section 22 - Cases, section 8)."""


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


VALID_CASE_PAYLOAD = {
    "case_number": "2026/201",
    "case_name": "Ticari Alacak Davası",
    "client_name": "XYZ Ticaret Ltd.",
    "opposing_party": "QRS Sanayi A.Ş.",
    "case_type": "ticaret_hukuku",
    "court": "İstanbul 4. Asliye Ticaret Mahkemesi",
    "status": "devam_eden",
}


def test_case_events_appear_in_chronological_timeline(client, two_firms_two_users):
    fixtures = two_firms_two_users
    token = _login(client, fixtures["user_a"].email, fixtures["password"])
    headers = {"Authorization": f"Bearer {token}"}

    case = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()

    # Add events out of chronological order.
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-03-01", "title": "Bilirkişi raporu alındı", "event_type": "expert_report"},
        headers=headers,
    )
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-01-12", "title": "Dava açıldı", "event_type": "filing"},
        headers=headers,
    )
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-02-15", "title": "Cevap dilekçesi sunuldu", "event_type": "submission"},
        headers=headers,
    )

    detail = client.get(f"/cases/{case['id']}", headers=headers).json()
    timeline = detail["timeline"]
    assert len(timeline) == 3
    dates = [event["event_date"] for event in timeline]
    assert dates == sorted(dates)
    assert timeline[0]["title"] == "Dava açıldı"
    assert timeline[-1]["title"] == "Bilirkişi raporu alındı"
