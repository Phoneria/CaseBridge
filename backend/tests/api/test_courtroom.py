"""Interactive courtroom API and turn-worker behaviour."""
from app.ai.courtroom import CourtroomMockProvider
from app.db.courtroom_seed import seed_courtroom_scenarios
from app.services.courtroom_worker import process_one_pending_courtroom_turn
from app.services import voice_service


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

    assert len(body) == 6
    assert body[0]["public_facts"]
    assert "plaintiff_private_brief" not in body[0]
    assert "judge_instructions" not in body[0]


def test_start_hearing_from_owned_case_without_exposing_it_to_other_firm(client, two_firms_two_users, db_session):
    from app.models.case import Case, CaseType
    from app.models.courtroom import CourtroomScenario

    case = Case(
        law_firm_id=two_firms_two_users["firm_a"].id,
        case_number="2026/777", case_name="Örnek Alacak Davası",
        client_name="Müvekkil A", opposing_party="Şirket B",
        case_type=CaseType.TICARET_HUKUKU,
        description="Ödenmeyen hizmet bedeli iddiası.",
    )
    db_session.add(case)
    db_session.commit()
    owner = _headers(client, two_firms_two_users, "user_a")
    outsider = _headers(client, two_firms_two_users, "user_b")
    created = client.post("/courtroom-sessions/from-case", headers=owner, json={
        "case_id": case.id, "chosen_role": "defendant",
    })
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "active"
    assert body["scenario"]["defendant_name"] == "Müvekkil A"
    assert "Ödenmeyen hizmet bedeli" in " ".join(body["scenario"]["public_facts"])
    scenario = db_session.query(CourtroomScenario).filter_by(source_case_id=case.id).one()
    assert client.get(f"/courtroom-scenarios/{scenario.id}", headers=outsider).status_code == 404
    assert client.post("/courtroom-sessions", headers=outsider, json={"scenario_id": scenario.id, "chosen_role": "plaintiff"}).status_code == 404
    assert client.post("/courtroom-sessions/from-case", headers=outsider, json={"case_id": case.id, "chosen_role": "plaintiff"}).status_code == 404


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


def test_voice_uses_owned_session_and_persisted_ai_turn(client, two_firms_two_users, db_session, monkeypatch):
    scenario = _seed_and_pick(db_session)
    owner = _headers(client, two_firms_two_users, "user_a")
    outsider = _headers(client, two_firms_two_users, "user_b")
    created = client.post("/courtroom-sessions", headers=owner, json={
        "scenario_id": scenario.id, "chosen_role": "plaintiff",
    }).json()
    path = f"/courtroom-sessions/{created['id']}/voice"

    monkeypatch.setattr(voice_service, "transcribe", lambda filename, content_type, data: "Sayın hâkim, delilim budur.")
    audio = {"file": ("move.webm", b"audio", "audio/webm")}
    assert client.post(f"{path}/transcribe", headers=outsider, files=audio).status_code == 404
    transcript = client.post(f"{path}/transcribe", headers=owner, files=audio)
    assert transcript.status_code == 200
    assert transcript.json() == {"text": "Sayın hâkim, delilim budur."}
    assert client.post(f"{path}/transcribe", headers=owner, files={"file": ("x.txt", b"audio", "text/plain")}).status_code == 422

    client.post(f"/courtroom-sessions/{created['id']}/moves", headers=owner, json={
        "action_type": "opening", "content": "Sayın hâkim, borç ödenmemiştir.",
        "client_request_id": "voice-turn-1",
    })
    assert client.post(f"{path}/transcribe", headers=owner, files=audio).status_code == 409
    process_one_pending_courtroom_turn(db_session, CourtroomMockProvider())
    state = client.get(f"/courtroom-sessions/{created['id']}", headers=owner).json()
    opponent = next(turn for turn in state["turns"] if turn["actor"] == "opponent")
    own_turn = next(turn for turn in state["turns"] if turn["actor"] == "user")
    monkeypatch.setattr(voice_service, "synthesize", lambda text, actor: b"mp3-bytes")
    assert client.get(f"{path}/turns/{opponent['id']}", headers=outsider).status_code == 404
    assert client.get(f"{path}/turns/{own_turn['id']}", headers=owner).status_code == 404
    spoken = client.get(f"{path}/turns/{opponent['id']}", headers=owner)
    assert spoken.status_code == 200
    assert spoken.headers["content-type"] == "audio/mpeg"
    assert spoken.content == b"mp3-bytes"


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


class _RecordingRouter:
    def __init__(self, inner):
        self.inner = inner
        self.tasks = []
        self.last_usage = None
        self.last_latency_ms = 0.0

    def for_task(self, task):
        self.tasks.append(task)
        return self.inner

    def complete(self, system_prompt, user_prompt, *, response_format=None):
        return self.inner.complete(system_prompt, user_prompt, response_format=response_format)


def test_courtroom_calls_ask_for_their_task_levels(client, two_firms_two_users, db_session):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    created = client.post(
        "/courtroom-sessions",
        headers=headers,
        json={"scenario_id": scenario.id, "chosen_role": "plaintiff"},
    ).json()
    router = _RecordingRouter(CourtroomMockProvider())
    moves = [
        ("opening", "Sayın hâkim, transfer geri ödenmek üzere yapılmıştır.", None),
        ("argument", "Tarafların sonraki yazışmaları borç ilişkisini doğrulamaktadır.", None),
        ("evidence", "Dekonttaki vade ve borç açıklaması taraf iradesini gösterir.", "BORC_DEKONT"),
        ("answer", "Yazılı kayıtlar birbirini tamamlamakta ve zaman çizelgesiyle uyuşmaktadır.", None),
        ("rebuttal", "İş planı imzasız bir taslaktır; borç kayıtlarını ortadan kaldırmaz.", None),
        ("closing", "Kabul edilen dekont ve tutarlı beyanlar uyarınca talebimizin kabulünü isteriz.", None),
    ]
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
        process_one_pending_courtroom_turn(db_session, router)

    assert router.tasks == ["courtroom.opponent", "courtroom.judge_interim"] * 5 + [
        "courtroom.opponent",
        "courtroom.judge_final",
    ]


def test_json_repair_uses_the_repair_task():
    from app.ai.courtroom import OpponentOutput, parse_with_one_repair

    router = _RecordingRouter(CourtroomMockProvider())
    try:
        parse_with_one_repair(router, "bozuk çıktı", OpponentOutput)
    except Exception:
        pass  # the mock may not produce a valid repair; only the routing matters here
    assert router.tasks == ["courtroom.json_repair"]
