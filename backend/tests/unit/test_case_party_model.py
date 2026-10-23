"""Case intake columns and the CaseParty model."""
from app.db.purge import delete_cases
from app.models.case import Case, CaseParty, CaseType
from app.models.law_firm import LawFirm


def _firm_and_case(db_session, **overrides):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    case = Case(
        law_firm_id=firm.id,
        case_number="2026/1",
        case_name="Alacak Davası",
        client_name="A Ltd.",
        case_type=CaseType.TICARET_HUKUKU,
        **overrides,
    )
    db_session.add(case)
    db_session.flush()
    return firm, case


def test_case_stores_the_intake_fields(db_session):
    _, case = _firm_and_case(
        db_session,
        client_role="plaintiff",
        court_file_number="2026/45 Esas",
        claim="150.000 TL alacak",
        facts_summary="Fatura ödenmedi.",
        plaintiff_position="Mal teslim edildi.",
        defendant_position="Mal ayıplı.",
    )
    db_session.commit()
    db_session.expire_all()

    stored = db_session.get(Case, case.id)
    assert stored.client_role == "plaintiff"
    assert stored.court_file_number == "2026/45 Esas"
    assert stored.claim == "150.000 TL alacak"
    assert stored.facts_summary == "Fatura ödenmedi."
    assert stored.plaintiff_position == "Mal teslim edildi."
    assert stored.defendant_position == "Mal ayıplı."


def test_new_columns_default_to_none(db_session):
    _, case = _firm_and_case(db_session)
    db_session.commit()
    assert case.client_role is None
    assert case.court_file_number is None
    assert case.claim is None
    assert case.parties == []


def test_parties_are_returned_in_sort_order(db_session):
    firm, case = _firm_and_case(db_session)
    case.parties = [
        CaseParty(law_firm_id=firm.id, name="Davalı", role="defendant", is_client=False, sort_order=1),
        CaseParty(law_firm_id=firm.id, name="Davacı", role="plaintiff", is_client=True, counsel_name="Av. Ece", sort_order=0),
    ]
    db_session.commit()
    db_session.expire_all()

    parties = db_session.get(Case, case.id).parties
    assert [party.name for party in parties] == ["Davacı", "Davalı"]
    assert parties[0].is_client is True
    assert parties[0].counsel_name == "Av. Ece"
    assert parties[1].counsel_name is None
    assert parties[0].created_at is not None


def test_replacing_the_party_list_deletes_the_old_rows(db_session):
    firm, case = _firm_and_case(db_session)
    case.parties = [CaseParty(law_firm_id=firm.id, name="Eski", role="other", is_client=True, sort_order=0)]
    db_session.commit()

    case.parties = [CaseParty(law_firm_id=firm.id, name="Yeni", role="other", is_client=True, sort_order=0)]
    db_session.commit()

    assert [party.name for party in db_session.query(CaseParty).all()] == ["Yeni"]


def test_purge_deletes_parties_with_the_case(db_session):
    firm, case = _firm_and_case(db_session)
    case.parties = [CaseParty(law_firm_id=firm.id, name="A Ltd.", role="other", is_client=True, sort_order=0)]
    db_session.commit()

    assert delete_cases(db_session, [case]) == 1
    db_session.commit()

    assert db_session.query(Case).count() == 0
    assert db_session.query(CaseParty).count() == 0
