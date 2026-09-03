"""Interactive courtroom API and turn-worker behaviour."""
from app.ai.courtroom import CourtroomMockProvider
from app.db.courtroom_seed import seed_courtroom_scenarios
from app.services.courtroom_worker import process_one_pending_courtroom_turn


def _headers(client, fixtures, who="user_a"):
    response = client.post(
        "/auth/login",
        json={"email": fixtures[who].email, "password": fixtures["password"]},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _seed_and_pick(db_session):
    seed_courtroom_scenarios(db_session)
    db_session.commit()
    from app.models.courtroom import CourtroomScenario

    return db_session.query(CourtroomScenario).filter_by(slug="odenmeyen-borc").first()


def test_scenarios_expose_public_information_only(client, two_firms_two_users, db_session):
    _seed_and_pick(db_session)
    body = client.get(
        "/courtroom-scenarios", headers=_headers(client, two_firms_two_users)
    ).json()

    assert len(body) == 5
    assert body[0]["public_facts"]
    assert "plaintiff_private_brief" not in body[0]
    assert "judge_instructions" not in body[0]


def test_create_session_reveals_only_chosen_role_material(
    client, two_firms_two_users, db_session
):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    response = client.post(
        "/courtroom-sessions",
        headers=headers,
        json={"scenario_id": scenario.id, "chosen_role": "plaintiff"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["current_actor"] == "user"
    assert body["role_brief"]["objective"] == scenario.plaintiff_private_brief["objective"]
    codes = {item["code"] for item in body["available_evidence"]}
    assert "BORC_DEKONT" in codes
    assert "BORC_IS_PLANI" not in codes
    assert all("defendant_private_brief" not in str(turn) for turn in body["turns"])


def test_full_six_phase_session_completes_and_scores_user(
    client, two_firms_two_users, db_session
):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    created = client.post(
        "/courtroom-sessions",
        headers=headers,
        json={"scenario_id": scenario.id, "chosen_role": "plaintiff"},
    ).json()
    provider = CourtroomMockProvider()

    moves = [
        ("opening", "Sayın hâkim, transfer geri ödenmek üzere yapılmıştır.", None),
        ("argument", "Tarafların sonraki yazışmaları borç ilişkisini doğrulamaktadır.", None),
        ("evidence", "Dekonttaki vade ve borç açıklaması taraf iradesini gösterir.", "BORC_DEKONT"),
        ("answer", "Yazılı kayıtlar birbirini tamamlamakta ve zaman çizelgesiyle uyuşmaktadır.", None),
        ("rebuttal", "İş planı imzasız bir taslaktır; borç kayıtlarını ortadan kaldırmaz.", None),
        ("closing", "Kabul edilen dekont ve tutarlı beyanlar uyarınca talebimizin kabulünü isteriz.", None),
    ]
    state = created
    for index, (action, content, evidence) in enumerate(moves):
        response = client.post(
            f"/courtroom-sessions/{created['id']}/moves",
            headers=headers,
            json={
                "action_type": action,
                "content": content,
                "evidence_code": evidence,
                "client_request_id": f"request-{index:02d}",
            },
        )
        assert response.status_code == 202
        assert response.json()["current_actor"] == "opponent"
        process_one_pending_courtroom_turn(db_session, provider)
        state = client.get(
            f"/courtroom-sessions/{created['id']}", headers=headers
        ).json()

    assert state["status"] == "completed"
    assert state["phase"] == "verdict"
    assert state["evaluation"]["total_score"] == 69
    assert state["evaluation"]["requires_verification"] is True
    assert "BORC_DEKONT" in state["admitted_evidence_codes"]
    assert len(state["turns"]) == 19  # instruction + 6 x (user, opponent, judge)


def test_duplicate_move_is_idempotent_and_sessions_are_user_scoped(
    client, two_firms_two_users, db_session
):
    scenario = _seed_and_pick(db_session)
    headers_a = _headers(client, two_firms_two_users, "user_a")
    headers_b = _headers(client, two_firms_two_users, "user_b")
    created = client.post(
        "/courtroom-sessions",
        headers=headers_a,
        json={"scenario_id": scenario.id, "chosen_role": "defendant"},
    ).json()
    payload = {
        "action_type": "opening",
        "content": "Transferin ortak yatırım amacıyla yapıldığını savunuyoruz.",
        "client_request_id": "same-request-01",
    }

    first = client.post(
        f"/courtroom-sessions/{created['id']}/moves", headers=headers_a, json=payload
    )
    second = client.post(
        f"/courtroom-sessions/{created['id']}/moves", headers=headers_a, json=payload
    )
    assert first.status_code == second.status_code == 202
    assert len(second.json()["turns"]) == 2
    assert client.get(
        f"/courtroom-sessions/{created['id']}", headers=headers_b
    ).status_code == 404


def test_wrong_phase_action_and_foreign_evidence_are_rejected(
    client, two_firms_two_users, db_session
):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    created = client.post(
        "/courtroom-sessions",
        headers=headers,
        json={"scenario_id": scenario.id, "chosen_role": "plaintiff"},
    ).json()

    wrong_phase = client.post(
        f"/courtroom-sessions/{created['id']}/moves",
        headers=headers,
        json={"action_type": "closing", "content": "Erken kapanış beyanı."},
    )
    assert wrong_phase.status_code == 422

    foreign_evidence = client.post(
        f"/courtroom-sessions/{created['id']}/moves",
        headers=headers,
        json={
            "action_type": "opening",
            "content": "Karşı taraf delilini sunmak istiyorum.",
            "evidence_code": "BORC_IS_PLANI",
        },
    )
    assert foreign_evidence.status_code == 422
