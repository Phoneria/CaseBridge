"""Case intake fields and parties on the cases API."""
from app.models.case import Case, CaseParty

NO_CLIENT_MESSAGE = "En az bir taraf müvekkil olarak işaretlenmeli."

BASE = {
    "case_number": "2026/501",
    "case_name": "Alacak Davası",
    "case_type": "ticaret_hukuku",
}


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _party(name, role, is_client=False, counsel_name=None):
    return {"name": name, "role": role, "is_client": is_client, "counsel_name": counsel_name}


def _post(client, headers, **extra):
    return client.post("/cases", json={**BASE, **extra}, headers=headers)


def test_create_with_parties_derives_names_and_client_role(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    response = _post(
        client,
        headers,
        parties=[
            _party("A Ltd.", "plaintiff", True, "Av. Ece Kaya"),
            _party("B A.Ş.", "defendant", False, "Av. Can Er"),
            _party("C Bey", "intervener"),
        ],
        court_file_number="2026/45 Esas",
        claim="150.000 TL alacak",
        facts_summary="Fatura ödenmedi.",
        plaintiff_position="Mal teslim edildi.",
        defendant_position="Mal ayıplı.",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["client_name"] == "A Ltd."
    assert body["opposing_party"] == "B A.Ş."
    assert body["client_role"] == "plaintiff"
    assert body["court_file_number"] == "2026/45 Esas"
    assert body["claim"] == "150.000 TL alacak"
    assert body["facts_summary"] == "Fatura ödenmedi."
    assert body["plaintiff_position"] == "Mal teslim edildi."
    assert body["defendant_position"] == "Mal ayıplı."
    assert [(p["name"], p["role"], p["is_client"], p["counsel_name"], p["sort_order"]) for p in body["parties"]] == [
        ("A Ltd.", "plaintiff", True, "Av. Ece Kaya", 0),
        ("B A.Ş.", "defendant", False, "Av. Can Er", 1),
        ("C Bey", "intervener", False, None, 2),
    ]


def test_party_text_is_trimmed_and_blank_counsel_becomes_null(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(client, headers, parties=[_party("  A Ltd.  ", "plaintiff", True, "   ")]).json()
    assert body["parties"][0]["name"] == "A Ltd."
    assert body["parties"][0]["counsel_name"] is None


def test_multiple_clients_are_joined_and_an_explicit_client_role_wins(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(
        client,
        headers,
        client_role="defendant",
        parties=[_party("A", "plaintiff", True), _party("B", "plaintiff", True), _party("C", "defendant"), _party("D", "plaintiff")],
    ).json()
    assert body["client_name"] == "A, B"
    assert body["client_role"] == "defendant"
    assert body["opposing_party"] == "D"


def test_intervener_client_gets_client_role_other_and_all_other_parties_oppose(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(
        client,
        headers,
        parties=[_party("A", "intervener", True), _party("B", "plaintiff"), _party("C", "defendant")],
    ).json()
    assert body["client_role"] == "other"
    assert body["opposing_party"] == "B, C"


def test_no_opposing_party_is_null(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(client, headers, parties=[_party("A", "plaintiff", True)]).json()
    assert body["opposing_party"] is None


def test_parties_without_a_client_are_rejected_with_a_message(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    response = _post(client, headers, parties=[_party("A", "plaintiff"), _party("B", "defendant")])
    assert response.status_code == 422
    assert response.json()["detail"] == NO_CLIENT_MESSAGE


def test_party_list_size_and_names_are_validated(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    assert _post(client, headers, parties=[]).status_code == 422
    assert _post(client, headers, parties=[_party(f"P{i}", "other", i == 0) for i in range(21)]).status_code == 422
    assert _post(client, headers, parties=[_party("   ", "plaintiff", True)]).status_code == 422
    assert _post(client, headers, parties=[_party("A", "king", True)]).status_code == 422
    assert _post(client, headers, parties=[_party("A" * 256, "plaintiff", True)]).status_code == 422
    assert _post(client, headers, parties=[_party(f"P{i}", "other", i == 0) for i in range(20)]).status_code == 201


def test_client_role_and_file_number_are_validated(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    assert _post(client, headers, client_name="A", client_role="king").status_code == 422
    assert _post(client, headers, client_name="A", court_file_number="x" * 101).status_code == 422


def test_legacy_post_without_parties_creates_the_client_and_opposing_party(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(client, headers, client_name="Ahmet Yılmaz", opposing_party="Zeynep Kaya").json()

    assert body["client_name"] == "Ahmet Yılmaz"
    assert body["opposing_party"] == "Zeynep Kaya"
    assert body["client_role"] is None
    assert [(p["name"], p["role"], p["is_client"], p["sort_order"]) for p in body["parties"]] == [
        ("Ahmet Yılmaz", "other", True, 0),
        ("Zeynep Kaya", "other", False, 1),
    ]


def test_legacy_post_without_an_opposing_party_creates_one_party(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    body = _post(client, headers, client_name="Ahmet Yılmaz").json()
    assert [p["name"] for p in body["parties"]] == ["Ahmet Yılmaz"]


def test_client_name_is_still_required_without_parties(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    assert _post(client, headers).status_code == 422
    assert _post(client, headers, client_name="   ").status_code == 422


def test_parties_are_returned_by_detail_and_list(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, parties=[_party("A", "plaintiff", True), _party("B", "defendant")]).json()

    detail = client.get(f"/cases/{created['id']}", headers=headers).json()
    listed = client.get("/cases", headers=headers).json()

    assert [p["name"] for p in detail["parties"]] == ["A", "B"]
    assert [p["name"] for p in listed[0]["parties"]] == ["A", "B"]


def test_patch_with_parties_replaces_the_list_and_rederives_names(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, parties=[_party("A", "plaintiff", True), _party("B", "defendant")]).json()

    response = client.patch(
        f"/cases/{created['id']}",
        json={"parties": [_party("Yeni Müvekkil", "defendant", True, "Av. Ece"), _party("Karşı Ltd.", "plaintiff")]},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_name"] == "Yeni Müvekkil"
    assert body["opposing_party"] == "Karşı Ltd."
    assert body["client_role"] == "defendant"
    assert [p["name"] for p in body["parties"]] == ["Yeni Müvekkil", "Karşı Ltd."]
    assert db_session.query(CaseParty).filter_by(case_id=created["id"]).count() == 2


def test_patch_with_an_explicit_client_role_keeps_it(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, parties=[_party("A", "plaintiff", True)]).json()
    body = client.patch(
        f"/cases/{created['id']}",
        json={"client_role": "other", "parties": [_party("A", "plaintiff", True), _party("B", "defendant")]},
        headers=headers,
    ).json()
    assert body["client_role"] == "other"
    assert body["opposing_party"] == "B"


def test_patch_parties_without_a_client_is_rejected_and_changes_nothing(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, parties=[_party("A", "plaintiff", True), _party("B", "defendant")]).json()

    response = client.patch(f"/cases/{created['id']}", json={"parties": [_party("C", "plaintiff")]}, headers=headers)

    assert response.status_code == 422
    assert response.json()["detail"] == NO_CLIENT_MESSAGE
    assert [p["name"] for p in client.get(f"/cases/{created['id']}", headers=headers).json()["parties"]] == ["A", "B"]


def test_patch_without_parties_keeps_them(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, parties=[_party("A", "plaintiff", True), _party("B", "defendant")]).json()

    body = client.patch(
        f"/cases/{created['id']}",
        json={"claim": "Yeni talep", "court_file_number": "2026/9 Esas", "status": "kapali"},
        headers=headers,
    ).json()

    assert body["claim"] == "Yeni talep"
    assert body["court_file_number"] == "2026/9 Esas"
    assert [p["name"] for p in body["parties"]] == ["A", "B"]
    assert body["client_name"] == "A"


def test_patch_can_clear_an_intake_field(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = _post(client, headers, client_name="A", claim="Talep").json()
    body = client.patch(f"/cases/{created['id']}", json={"claim": None}, headers=headers).json()
    assert body["claim"] is None


def test_other_firm_cannot_read_or_change_parties(client, two_firms_two_users):
    headers_a = _headers(client, two_firms_two_users, "user_a")
    headers_b = _headers(client, two_firms_two_users, "user_b")
    created = _post(client, headers_a, parties=[_party("A", "plaintiff", True)]).json()

    assert client.get(f"/cases/{created['id']}", headers=headers_b).status_code == 404
    assert client.patch(f"/cases/{created['id']}", json={"parties": [_party("X", "plaintiff", True)]}, headers=headers_b).status_code == 404
    assert client.get("/cases", headers=headers_b).json() == []


def test_duplicate_case_number_is_a_409_and_leaves_no_orphan_parties(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    assert _post(client, headers, parties=[_party("A", "plaintiff", True)]).status_code == 201

    response = _post(client, headers, parties=[_party("B", "plaintiff", True)])

    assert response.status_code == 409
    assert db_session.query(CaseParty).count() == 1


def test_lawyer_assignment_rules_still_apply_with_parties(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    response = _post(client, headers, assigned_lawyer_id="someone-else", parties=[_party("A", "plaintiff", True)])
    assert response.status_code == 403


def test_precedents_expose_their_parties(client, db_session, two_firms_two_users):
    from app.models.case import CaseType

    firm = two_firms_two_users["firm_a"]
    precedent = Case(
        law_firm_id=firm.id, case_number="Y9HD 2026/1", case_name="Karar", client_name="Davacı (anonim)",
        opposing_party="Davalı Şirket", case_type=CaseType.IS_HUKUKU, is_precedent=True,
    )
    precedent.parties = [
        CaseParty(law_firm_id=firm.id, name="Davacı (anonim)", role="other", is_client=True, sort_order=0),
        CaseParty(law_firm_id=firm.id, name="Davalı Şirket", role="other", is_client=False, sort_order=1),
    ]
    db_session.add(precedent)
    db_session.commit()
    headers = _headers(client, two_firms_two_users)

    body = client.get(f"/precedents/{precedent.id}", headers=headers).json()

    assert [p["name"] for p in body["parties"]] == ["Davacı (anonim)", "Davalı Şirket"]
