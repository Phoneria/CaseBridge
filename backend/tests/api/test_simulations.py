"""Simulation API (section 22 - Simulation, Structured Outputs, Assessment).

Phase 3: simulations are non-blocking jobs. POST returns 202 with a
PENDING (or already-in-flight) row immediately - no LLM call in that
request. Tests drive the worker explicitly via
`process_one_pending_simulation(db_session, provider)` for
deterministic, race-free control (see simulation_worker.py docstring).
"""
import json

from app.services.simulation_worker import process_one_pending_simulation

VALID_CASE_PAYLOAD = {
    "case_number": "2026/401",
    "case_name": "Ortaklığın Giderilmesi Davası",
    "client_name": "Selin Doğan",
    "opposing_party": "Kardeş Ortaklar",
    "case_type": "diger",
    "court": "Ankara 2. Sulh Hukuk Mahkemesi",
    "status": "devam_eden",
}

VALID_JUDGE_JSON = json.dumps(
    {
        "summary": "Genel degerlendirme.",
        "strong_points": ["Guclu nokta 1"],
        "weak_points": ["Zayif nokta 1"],
        "opposing_arguments": ["Karsi arguman 1"],
        "missing_information": ["Eksik bilgi 1"],
        "possible_scenarios": ["Senaryo 1"],
        "questions": ["Soru 1"],
        "recommended_actions": ["Aksiyon 1"],
        "assessment": {"score": 80, "confidence": "high"},
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
    return client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()


def _override_provider(app, responses):
    from app.ai.providers.mock_provider import MockProvider
    from app.api.deps import get_llm_provider_dep

    provider = MockProvider(responses=responses)
    app.dependency_overrides[get_llm_provider_dep] = lambda: provider
    return provider


def test_start_simulation_returns_pending_immediately(client, two_firms_two_users):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    response = client.post(f"/cases/{case['id']}/simulations", headers=headers)
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "pending"
    assert body["result"] is None


def test_worker_completes_simulation_with_structured_result(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    created = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()
    process_one_pending_simulation(db_session, provider)

    polled = client.get(f"/cases/{case['id']}/simulations/{created['id']}", headers=headers).json()
    assert polled["status"] == "completed"
    assert polled["result"]["assessment"]["score"] == 80
    assert polled["result"]["ai_disclaimer"]


def test_duplicate_post_while_in_flight_is_idempotent(client, two_firms_two_users):
    """A duplicate click (POST while a simulation for the case is still
    pending/running) must never create a second job - it returns the
    existing one."""
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    first = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()
    second = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()
    assert first["id"] == second["id"]

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert len(list_response.json()) == 1


def test_simulation_stored_against_correct_case(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    created = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()
    process_one_pending_simulation(db_session, provider)

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert list_response.status_code == 200
    ids = {s["id"] for s in list_response.json()}
    assert created["id"] in ids


def test_case_can_have_multiple_simulations(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    client.post(f"/cases/{case['id']}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)
    client.post(f"/cases/{case['id']}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert len(list_response.json()) == 2


def test_simulation_isolated_by_law_firm(client, two_firms_two_users):
    from app.main import app

    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    case = _create_case(client, headers_a)
    _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    created = client.post(f"/cases/{case['id']}/simulations", headers=headers_a).json()

    assert client.get(f"/cases/{case['id']}/simulations", headers=headers_b).status_code == 404
    assert client.post(f"/cases/{case['id']}/simulations", headers=headers_b).status_code == 404
    assert (
        client.get(f"/cases/{case['id']}/simulations/{created['id']}", headers=headers_b).status_code
        == 404
    )


def test_simulation_handles_provider_timeout_gracefully(client, two_firms_two_users, db_session):
    from app.ai.errors import AIProviderTimeoutError
    from app.ai.providers.base import LLMProvider
    from app.api.deps import get_llm_provider_dep
    from app.main import app

    class TimeoutProvider(LLMProvider):
        def complete(self, system_prompt, user_prompt, *, response_format=None):
            raise AIProviderTimeoutError("simulated timeout")

    provider = TimeoutProvider()
    app.dependency_overrides[get_llm_provider_dep] = lambda: provider

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    created = client.post(f"/cases/{case['id']}/simulations", headers=headers)
    assert created.status_code == 202
    process_one_pending_simulation(db_session, provider)

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    failed = list_response.json()[0]
    assert failed["status"] == "failed"
    assert failed["failure_category"] == "timeout"


def test_simulation_handles_invalid_ai_response_gracefully(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", "not json"]
    )

    client.post(f"/cases/{case['id']}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert list_response.json()[0]["status"] == "failed"


def test_assessment_score_never_exceeds_bounds_in_stored_result(client, two_firms_two_users, db_session):
    """Even if a real model somehow returns an out-of-range score, the
    worker must reject it (FAILED) rather than silently store or clip it."""
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    out_of_range_json = json.dumps(
        {
            "summary": "x",
            "strong_points": [],
            "weak_points": [],
            "opposing_arguments": [],
            "missing_information": [],
            "possible_scenarios": [],
            "questions": [],
            "recommended_actions": [],
            "assessment": {"score": 999, "confidence": "high"},
        }
    )
    provider = _override_provider(app, ["r", "p", "d", out_of_range_json])

    client.post(f"/cases/{case['id']}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert list_response.json()[0]["status"] == "failed"


def test_retry_creates_new_pending_simulation_and_keeps_failed_row(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(app, ["r", "p", "d", "not json"])

    failed = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()
    process_one_pending_simulation(db_session, provider)
    failed_polled = client.get(
        f"/cases/{case['id']}/simulations/{failed['id']}", headers=headers
    ).json()
    assert failed_polled["status"] == "failed"

    retry_response = client.post(
        f"/cases/{case['id']}/simulations/{failed['id']}/retry", headers=headers
    )
    assert retry_response.status_code == 202
    retried = retry_response.json()
    assert retried["id"] != failed["id"]
    assert retried["status"] == "pending"

    # original failed row is untouched, preserved as an audit trail
    still_failed = client.get(
        f"/cases/{case['id']}/simulations/{failed['id']}", headers=headers
    ).json()
    assert still_failed["status"] == "failed"

    list_response = client.get(f"/cases/{case['id']}/simulations", headers=headers)
    assert len(list_response.json()) == 2


def test_retry_rejected_when_simulation_is_not_failed(client, two_firms_two_users):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    pending = client.post(f"/cases/{case['id']}/simulations", headers=headers).json()

    retry_response = client.post(
        f"/cases/{case['id']}/simulations/{pending['id']}/retry", headers=headers
    )
    assert retry_response.status_code == 409


def test_retry_isolated_by_law_firm(client, two_firms_two_users, db_session):
    from app.main import app

    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    case = _create_case(client, headers_a)
    provider = _override_provider(app, ["r", "p", "d", "not json"])

    failed = client.post(f"/cases/{case['id']}/simulations", headers=headers_a).json()
    process_one_pending_simulation(db_session, provider)

    retry_response = client.post(
        f"/cases/{case['id']}/simulations/{failed['id']}/retry", headers=headers_b
    )
    assert retry_response.status_code == 404


def test_global_simulation_list_includes_case_name_and_number(client, two_firms_two_users, db_session):
    from app.main import app

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    provider = _override_provider(
        app, ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    client.post(f"/cases/{case['id']}/simulations", headers=headers)
    process_one_pending_simulation(db_session, provider)

    response = client.get("/simulations", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["case_name"] == VALID_CASE_PAYLOAD["case_name"]
    assert body[0]["status"] == "completed"


def test_global_simulation_list_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    _override_provider(
        app_from_main(), ["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    client.post(f"/cases/{case['id']}/simulations", headers=headers_a)

    response = client.get("/simulations", headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []


def app_from_main():
    from app.main import app

    return app
