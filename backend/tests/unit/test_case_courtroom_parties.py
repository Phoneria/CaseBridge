"""scenario_from_case uses the case parties and the intake fields."""
from app.models.case import Case, CaseParty, CaseType
from app.models.courtroom import CourtroomRole
from app.models.law_firm import LawFirm
from app.services.case_courtroom import scenario_from_case


def _case(db_session, parties=(), **overrides):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    fields = dict(
        law_firm_id=firm.id,
        case_number="2026/9",
        case_name="Alacak Davası",
        client_name="Eski Müvekkil",
        opposing_party="Eski Karşı Taraf",
        case_type=CaseType.TICARET_HUKUKU,
    )
    fields.update(overrides)
    case = Case(**fields)
    case.parties = [
        CaseParty(law_firm_id=firm.id, name=name, role=role, is_client=is_client, sort_order=index)
        for index, (name, role, is_client) in enumerate(parties)
    ]
    db_session.add(case)
    db_session.flush()
    return case


def test_party_names_come_from_the_parties_table(db_session):
    case = _case(
        db_session,
        parties=[("A Ltd.", "plaintiff", True), ("C Bey", "plaintiff", False), ("B A.Ş.", "defendant", False), ("D", "intervener", False)],
    )

    for role in (CourtroomRole.PLAINTIFF, CourtroomRole.DEFENDANT):
        scenario = scenario_from_case(db_session, case, role)
        assert scenario.plaintiff_name == "A Ltd., C Bey"
        assert scenario.defendant_name == "B A.Ş."


def test_a_side_without_parties_falls_back_to_the_legacy_names(db_session):
    case = _case(db_session, parties=[("A Ltd.", "plaintiff", True)])

    as_plaintiff = scenario_from_case(db_session, case, CourtroomRole.PLAINTIFF)
    as_defendant = scenario_from_case(db_session, case, CourtroomRole.DEFENDANT)

    assert (as_plaintiff.plaintiff_name, as_plaintiff.defendant_name) == ("A Ltd.", "Eski Karşı Taraf")
    assert (as_defendant.plaintiff_name, as_defendant.defendant_name) == ("A Ltd.", "Eski Müvekkil")


def test_a_case_without_parties_keeps_the_old_behaviour(db_session):
    case = _case(db_session)

    scenario = scenario_from_case(db_session, case, CourtroomRole.DEFENDANT)

    assert (scenario.plaintiff_name, scenario.defendant_name) == ("Eski Karşı Taraf", "Eski Müvekkil")


def test_party_names_are_cut_to_the_column_length(db_session):
    case = _case(db_session, parties=[("A" * 200, "plaintiff", True), ("B" * 200, "plaintiff", False), ("C", "defendant", False)])
    assert len(scenario_from_case(db_session, case, CourtroomRole.PLAINTIFF).plaintiff_name) == 255


def test_file_number_claim_and_facts_become_public_facts(db_session):
    case = _case(
        db_session,
        court_file_number="2026/45 Esas",
        claim="150.000 TL alacak",
        facts_summary="Fatura ödenmedi.",
    )

    facts = scenario_from_case(db_session, case, CourtroomRole.PLAINTIFF).public_facts

    assert "Esas numarası: 2026/45 Esas." in facts
    assert "Kayıtlı talep / dava konusu: 150.000 TL alacak" in facts
    assert "Kayıtlı olay özeti: Fatura ödenmedi." in facts


def test_new_fields_are_absent_from_the_facts_when_empty(db_session):
    facts = scenario_from_case(db_session, _case(db_session), CourtroomRole.PLAINTIFF).public_facts
    assert not any(line.startswith(("Esas numarası", "Kayıtlı talep", "Kayıtlı olay özeti")) for line in facts)


def test_long_claim_and_facts_are_cut_at_2000_characters(db_session):
    case = _case(db_session, claim="k" * 5000, facts_summary="f" * 5000)
    facts = scenario_from_case(db_session, case, CourtroomRole.PLAINTIFF).public_facts
    assert "Kayıtlı talep / dava konusu: " + "k" * 2000 in facts
    assert "Kayıtlı olay özeti: " + "f" * 2000 in facts


def test_each_side_brief_gets_its_own_position(db_session):
    case = _case(db_session, plaintiff_position="Mal teslim edildi.", defendant_position="Mal ayıplı.")

    scenario = scenario_from_case(db_session, case, CourtroomRole.PLAINTIFF)

    plaintiff_facts = scenario.plaintiff_private_brief["known_facts"]
    defendant_facts = scenario.defendant_private_brief["known_facts"]
    assert "Davacı tarafın kayıtlı iddiası: Mal teslim edildi." in plaintiff_facts
    assert "Davacı tarafın kayıtlı iddiası: Mal teslim edildi." not in defendant_facts
    assert "Davalı tarafın kayıtlı savunması: Mal ayıplı." in defendant_facts
    assert "Davalı tarafın kayıtlı savunması: Mal ayıplı." not in plaintiff_facts
    assert "Mal ayıplı." not in " ".join(scenario.public_facts)


def test_briefs_without_positions_are_unchanged(db_session):
    scenario = scenario_from_case(db_session, _case(db_session), CourtroomRole.PLAINTIFF)
    assert scenario.plaintiff_private_brief["known_facts"] == scenario.public_facts
    assert scenario.defendant_private_brief["known_facts"] == scenario.public_facts
