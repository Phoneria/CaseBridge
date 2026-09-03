"""Case repository respects law_firm_id scoping (section 22 - Cases)."""


def _make_case(firm_id, **overrides):
    from app.models.case import Case, CaseStatus, CaseType

    defaults = dict(
        law_firm_id=firm_id,
        case_number="2026/101",
        case_name="Test Davasi",
        client_name="Test Musteri",
        opposing_party="Test Karsi Taraf",
        case_type=CaseType.SOZLESME,
        court="Istanbul 3. Asliye Hukuk Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
    )
    defaults.update(overrides)
    return Case(**defaults)


def test_case_repository_scopes_get_by_id_to_firm(db_session):
    from app.models.law_firm import LawFirm
    from app.repositories.case_repository import CaseRepository

    firm_a = LawFirm(name="Firm A")
    firm_b = LawFirm(name="Firm B")
    db_session.add_all([firm_a, firm_b])
    db_session.flush()

    case = _make_case(firm_a.id)
    db_session.add(case)
    db_session.commit()
    db_session.refresh(case)

    repo = CaseRepository(db_session)
    assert repo.get_by_id_in_firm(case.id, firm_a.id) is not None
    assert repo.get_by_id_in_firm(case.id, firm_b.id) is None


def test_case_repository_list_only_returns_own_firm_cases(db_session):
    from app.models.law_firm import LawFirm
    from app.repositories.case_repository import CaseRepository

    firm_a = LawFirm(name="Firm A")
    firm_b = LawFirm(name="Firm B")
    db_session.add_all([firm_a, firm_b])
    db_session.flush()

    db_session.add(_make_case(firm_a.id, case_number="A-1"))
    db_session.add(_make_case(firm_b.id, case_number="B-1"))
    db_session.commit()

    repo = CaseRepository(db_session)
    results = repo.list_in_firm(firm_a.id)
    assert len(results) == 1
    assert results[0].case_number == "A-1"
