import pytest

from app.ai.courtroom import CourtroomMockProvider
from app.ai.errors import AIProviderError
from app.db.courtroom_seed import seed_courtroom_scenarios
from app.models.courtroom import CourtroomActor, CourtroomScenario, CourtroomTurn, CourtroomTurnType
from app.services.courtroom_service import is_finish_command
from app.services.courtroom_worker import process_one_pending_courtroom_turn


def create(client, db, users, auth_headers):
    seed_courtroom_scenarios(db)
    db.commit()
    scenario = db.query(CourtroomScenario).filter_by(slug="odenmeyen-borc").one()
    headers = auth_headers(users["user_a"])
    response = client.post("/courtroom-sessions", headers=headers, json={
        "scenario_id": scenario.id, "chosen_role": "plaintiff", "conversation_mode": True,
    })
    assert response.status_code == 201
    return response.json(), headers


class RecordingProvider(CourtroomMockProvider):
    def __init__(self):
        super().__init__()
        self.prompts = []

    def complete(self, system_prompt, user_prompt, **kwargs):
        self.prompts.append((system_prompt, user_prompt))
        return super().complete(system_prompt, user_prompt, **kwargs)


def test_conversation_continues_until_explicit_finish_and_judge_sees_all_turns(client, db_session, two_firms_two_users, auth_headers):
    session, headers = create(client, db_session, two_firms_two_users, auth_headers)
    path = f"/courtroom-sessions/{session['id']}"
    provider = RecordingProvider()
    for index in range(13):
        text = "FIRST_USER_POINT: ilk savunma beyanım." if index == 0 else f"Savunma beyanı {index}, karşı tarafın itirazını yanıtlıyorum."
        response = client.post(path + "/moves", headers=headers, json={"content": text, "action_type": "argument"})
        assert response.status_code == 202
        process_one_pending_courtroom_turn(db_session, provider)
        state = client.get(path, headers=headers).json()
        assert state["status"] == "active"
        assert state["current_actor"] == "user"
        assert state["evaluation"] is None
        assert not any(turn["actor"] == "judge" for turn in state["turns"])
    assert len(provider.prompts) == 13
    assert client.post(path + "/finish", headers=headers, json={}).status_code == 202
    assert client.post(path + "/finish", headers=headers, json={}).status_code == 202
    process_one_pending_courtroom_turn(db_session, provider)
    result = client.get(path, headers=headers).json()
    assert result["status"] == "completed"
    assert result["evaluation"]["total_score"] == 69
    assert len(provider.prompts) == 14
    assert "COURTROOM_JUDGE_FINAL" in provider.prompts[-1][0]
    assert "FIRST_USER_POINT" in provider.prompts[-1][1]
    assert len([turn for turn in result["turns"] if turn["actor"] == "judge"]) == 1
    assert len([turn for turn in result["turns"] if turn["actor"] == "opponent"]) == 13
    assert client.post(path + "/finish", headers=headers, json={}).json()["status"] == "completed"


def test_done_command_finishes_without_inventing_another_user_or_opponent_statement(client, db_session, two_firms_two_users, auth_headers):
    session, headers = create(client, db_session, two_firms_two_users, auth_headers)
    path = f"/courtroom-sessions/{session['id']}"
    client.post(path + "/moves", headers=headers, json={"content": "İlk savunmamı sunuyorum.", "action_type": "argument"})
    process_one_pending_courtroom_turn(db_session, CourtroomMockProvider())
    response = client.post(path + "/moves", headers=headers, json={"content": "BİTİR!", "action_type": "argument"})
    assert response.status_code == 202
    assert response.json()["phase"] == "closing"
    process_one_pending_courtroom_turn(db_session, CourtroomMockProvider())
    result = client.get(path, headers=headers).json()
    assert len([t for t in result["turns"] if t["actor"] == "user"]) == 1
    assert len([t for t in result["turns"] if t["actor"] == "opponent"]) == 1
    assert result["status"] == "completed"


def test_finish_checks_ownership_and_keeps_the_final_draft(client, db_session, two_firms_two_users, auth_headers):
    session, headers = create(client, db_session, two_firms_two_users, auth_headers)
    path = f"/courtroom-sessions/{session['id']}/finish"
    assert client.post(path, json={}).status_code == 401
    assert client.post(path, headers=auth_headers(two_firms_two_users["user_b"]), json={}).status_code == 404
    assert client.post(path, headers=headers, json={}).status_code == 422
    response = client.post(path, headers=headers, json={"content": "Son beyanım: talebimizin kabulünü istiyorum."})
    assert response.status_code == 202
    assert response.json()["turns"][-1]["content"].startswith("Son beyanım")


def test_failed_final_can_retry_without_an_extra_opponent_turn(client, db_session, two_firms_two_users, auth_headers):
    session, headers = create(client, db_session, two_firms_two_users, auth_headers)
    path = f"/courtroom-sessions/{session['id']}"
    client.post(path + "/finish", headers=headers, json={"content": "Savunmamı sundum, karar verilmesini istiyorum."})
    class Broken(CourtroomMockProvider):
        def complete(self, *args, **kwargs):
            raise AIProviderError("unavailable")
    process_one_pending_courtroom_turn(db_session, Broken())
    assert client.get(path, headers=headers).json()["status"] == "failed"
    assert client.post(path + "/retry", headers=headers).status_code == 202
    process_one_pending_courtroom_turn(db_session, CourtroomMockProvider())
    state = client.get(path, headers=headers).json()
    assert state["status"] == "completed"
    assert not any(turn["actor"] == "opponent" for turn in state["turns"])


def test_audio_segments_cover_the_entire_owned_reply(client, db_session, two_firms_two_users, auth_headers, monkeypatch):
    from app.services import voice_service
    session, headers = create(client, db_session, two_firms_two_users, auth_headers)
    turn = CourtroomTurn(session_id=session["id"], sequence_number=2, actor=CourtroomActor.OPPONENT,
        legal_role="defendant_lawyer", turn_type=CourtroomTurnType.ARGUMENT, content="A" * 9000, structured_data={})
    db_session.add(turn)
    db_session.commit()
    pieces = []
    def synthesize(text, actor, *, law_firm_id):
        assert law_firm_id == two_firms_two_users["firm_a"].id
        pieces.append(text)
        return b"synthetic-audio"
    monkeypatch.setattr(voice_service, "synthesize", synthesize)
    path = f"/courtroom-sessions/{session['id']}/voice/turns/{turn.id}"
    for part in range(3):
        assert client.get(path, params={"part": part}, headers=headers).status_code == 200
    assert [len(piece) for piece in pieces] == [4000, 4000, 1000]
    assert "".join(pieces) == turn.content
    assert client.get(path, params={"part": 3}, headers=headers).status_code == 404
    assert client.get(path, headers=auth_headers(two_firms_two_users["user_b"])).status_code == 404


@pytest.mark.parametrize("text", ["done", "DONE!", "Bitir.", "BİTİR", "bitti", "bit"])
def test_finish_command_is_standalone(text):
    assert is_finish_command(text)


@pytest.mark.parametrize("text", ["Savunmam bitti ama ekleyeceğim bir konu var.", "done kelimesini açıklıyorum", "bitirme"])
def test_ordinary_statements_do_not_finish(text):
    assert not is_finish_command(text)
