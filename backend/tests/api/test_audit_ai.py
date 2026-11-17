"""AI usage is recorded without any prompt, answer or move text."""
from tests.api.audit_helpers import audit_rows
from tests.api.test_chat import _send, chat_provider  # noqa: F401 - pytest fixture
from tests.api.test_courtroom import _seed_and_pick


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_case_intake_records_source_and_filled_fields(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    response = client.post("/case-intake/extract", headers=headers,
                           data={"text": "Davacı vekili sıfatıyla gizli dava dilekçesi sunuyorum."})
    assert response.status_code == 200, response.text
    [row] = audit_rows(db_session, "ai.case_intake")
    assert row.details["flags"] == {"source": "text"}
    assert row.details["counts"]["filled_fields"] > 0
    assert row.case_id is None


def test_analysis_start_is_recorded(client, db_session, two_firms_two_users):
    from app.main import app
    from tests.api.test_simulations import VALID_JUDGE_JSON, _override_provider

    headers = _headers(client, two_firms_two_users)
    case = client.post("/cases", headers=headers, json={
        "case_number": "AI/1", "case_name": "Gizli", "case_type": "kira",
        "parties": [{"name": "Gizli Müvekkil", "role": "plaintiff", "is_client": True}],
    }).json()
    _override_provider(app, ["R", "P", "D", VALID_JUDGE_JSON])
    response = client.post(f"/cases/{case['id']}/simulations", headers=headers)
    assert response.status_code == 202
    [row] = audit_rows(db_session, "ai.analysis_started")
    assert (row.case_id, row.target_type, row.target_id) == (case["id"], "simulation", response.json()["id"])


def test_courtroom_start_move_and_abandon(client, db_session, two_firms_two_users):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    session = client.post("/courtroom-sessions", headers=headers,
                          json={"scenario_id": scenario.id, "chosen_role": "plaintiff"}).json()
    [started] = audit_rows(db_session, "ai.courtroom_started")
    assert started.details == {"flags": {"source": "scenario"}} and started.target_id == session["id"]
    move = client.post(f"/courtroom-sessions/{session['id']}/moves", headers=headers,
                       json={"action_type": "opening", "content": "Gizli açılış beyanı.", "evidence_code": None,
                             "client_request_id": "request-00"})
    assert move.status_code == 202, move.text
    moves = audit_rows(db_session, "ai.courtroom_move")
    assert len(moves) == 1 and isinstance(moves[0].details["counts"]["moves"], int)
    assert client.post(f"/courtroom-sessions/{session['id']}/abandon", headers=headers).status_code == 200
    [abandoned] = audit_rows(db_session, "ai.courtroom_abandoned")
    assert set(abandoned.details["counts"]) == {"moves", "duration_min"}


def test_chat_message_and_feedback(client, db_session, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    events = _send(client, headers, conversation["id"], "Gizli soru metni")
    [message] = audit_rows(db_session, "ai.chat_message")
    assert message.details == {"flags": {"level": "standard"}}
    assert (message.target_type, message.target_id) == ("chat_conversation", conversation["id"])
    assistant_id = events[0]["assistant_message_id"]
    liked = client.put(f"/chat/messages/{assistant_id}/feedback", json={"value": 1}, headers=headers)
    assert liked.status_code == 200, liked.text
    [feedback] = audit_rows(db_session, "ai.chat_feedback")
    assert feedback.details == {"flags": {"feedback": "up"}}
    assert feedback.target_id == conversation["id"]
