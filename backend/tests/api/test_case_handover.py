"""Case Handover (section 18, 22 - Case Handover)."""
import json

VALID_JUDGE_JSON = json.dumps(
    {
        "summary": "Dava orta duzeyde risk tasimaktadir.",
        "strong_points": ["Yazili sozlesme mevcut"],
        "weak_points": ["Odeme kanitlari eksik"],
        "opposing_arguments": ["Karsi taraf fesih bildirimini reddediyor"],
        "missing_information": ["Tebligat kaydi"],
        "possible_scenarios": ["Kismi kabul"],
        "questions": ["Tebligat ne zaman yapildi?"],
        "recommended_actions": ["Tebligat kaydi talep edilmeli"],
        "assessment": {"score": 60, "confidence": "medium"},
    }
)


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers):
    payload = {
        "case_number": "2026/601",
        "case_name": "Devir Testi Davasi",
        "client_name": "Can Yildiz",
        "opposing_party": "Karsi Taraf A.S.",
        "case_type": "sozlesme",
        "court": "Istanbul 1. Asliye Hukuk Mahkemesi",
        "status": "devam_eden",
        "next_hearing_date": "2026-09-15",
    }
    return client.post("/cases", json=payload, headers=headers).json()


def _run_mock_simulation(client, app, case_id, headers, db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.api.deps import get_llm_provider_dep
    from app.services.simulation_worker import process_one_pending_simulation

    provider = MockProvider(
        responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    app.dependency_overrides[get_llm_provider_dep] = lambda: provider
    response = client.post(f"/cases/{case_id}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)
    return response


def test_handover_pending_tasks_reflects_only_pending_case_tasks(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    pending = client.post(
        f"/cases/{case['id']}/tasks", json={"title": "Tebligat kaydini talep et"}, headers=headers
    ).json()
    completed = client.post(
        f"/cases/{case['id']}/tasks", json={"title": "Dilekce hazirla"}, headers=headers
    ).json()
    client.patch(f"/cases/{case['id']}/tasks/{completed['id']}", json={"status": "completed"}, headers=headers)

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    pending_tasks = response.json()["pending_tasks"]
    assert pending_tasks == ["Tebligat kaydini talep et"]


def test_handover_report_generated(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["case_id"] == case["id"]
    assert body["case_overview"]["case_name"] == "Devir Testi Davasi"


def test_handover_includes_chronological_timeline(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-01-12", "title": "Dava acildi", "event_type": "filing"},
        headers=headers,
    )
    client.post(
        f"/cases/{case['id']}/events",
        json={"event_date": "2026-02-15", "title": "Cevap dilekcesi sunuldu", "event_type": "submission"},
        headers=headers,
    )

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    timeline = response.json()["timeline"]
    assert [e["title"] for e in timeline] == ["Dava acildi", "Cevap dilekcesi sunuldu"]


def test_handover_references_uploaded_documents(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("sozlesme.txt", b"icerik", "text/plain")},
        headers=headers,
    )

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    key_documents = response.json()["key_documents"]
    assert any(doc["filename"] == "sozlesme.txt" for doc in key_documents)


def test_handover_includes_pending_tasks_field(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    assert isinstance(response.json()["pending_tasks"], list)


def test_handover_includes_upcoming_dates(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    assert response.json()["upcoming_dates"] == ["2026-09-15"]


def test_handover_uses_latest_simulation_for_arguments_and_risks(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    sim_response = _run_mock_simulation(client, app, case["id"], headers, db_session)
    assert sim_response.status_code == 202

    response = client.post(f"/cases/{case['id']}/handover", headers=headers)
    body = response.json()
    assert "Yazili sozlesme mevcut" in body["important_arguments"]
    assert "Odeme kanitlari eksik" in body["risks"]
    assert "Tebligat kaydi talep edilmeli" in body["recommended_next_steps"]


def test_handover_report_belongs_to_correct_case_and_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    case = _create_case(client, headers_a)
    assert client.post(f"/cases/{case['id']}/handover", headers=headers_b).status_code == 404
