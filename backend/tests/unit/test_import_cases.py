import json

import pytest

from app.db.import_cases import import_folder
from app.models.case import Case, CaseEvent, CaseParty, CaseStatus, CaseType
from app.models.document import Document
from app.models.task import Task


@pytest.fixture()
def seeded(db_session):
    from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name=DEMO_FIRM_NAME)
    db_session.add(firm)
    db_session.flush()
    db_session.add(User(law_firm_id=firm.id, email=LAWYER_EMAIL, hashed_password="x", full_name="A",
                        role=UserRole.LAWYER, is_active=True))
    db_session.commit()
    return firm


def _write(folder, cases, files=None, record_kind=None):
    (folder / "documents").mkdir(parents=True, exist_ok=True)
    for name, content in (files or {}).items():
        (folder / "documents" / name).write_bytes(content)
    manifest = {"cases": cases}
    if record_kind:
        manifest["record_kind"] = record_kind
    (folder / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")


CASE = {
    "case_number": "2024/101",
    "case_name": "Kıdem tazminatı alacağı",
    "client_name": "Davacı (anonim)",
    "opposing_party": "Davalı Şirket",
    "case_type": "is_hukuku",
    "court": "Yargıtay 9. Hukuk Dairesi",
    "opening_date": "2023-05-10",
    "status": "kapali",
    "outcome": "won",
    "description": "Özet",
    "events": [{"title": "Karar verildi", "event_type": "hearing", "event_date": "2024-02-01"}],
    "tasks": [{"title": "Kararı müvekkile ilet", "due_date": "2024-02-10"}],
    "documents": [
        {"file": "karar.txt"},
        {"filename": "ozet.txt", "text": "Kısa özet metni"},
    ],
}


def test_imports_case_with_documents_events_tasks(db_session, seeded, tmp_path):
    _write(tmp_path, [CASE], {"karar.txt": "Karar metni".encode()})
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats == {"created": 1, "updated": 0, "documents": 2, "errors": []}

    case = db_session.query(Case).one()
    assert case.case_type == CaseType.IS_HUKUKU
    assert case.status == CaseStatus.KAPALI
    texts = {d.filename: d.extracted_text for d in db_session.query(Document).all()}
    assert texts == {"karar.txt": "Karar metni", "ozet.txt": "Kısa özet metni"}
    assert db_session.query(CaseEvent).count() == 1
    assert db_session.query(Task).count() == 1


def test_import_is_idempotent(db_session, seeded, tmp_path):
    _write(tmp_path, [CASE], {"karar.txt": b"x"})
    import_folder(str(tmp_path), db=db_session)
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 0 and stats["updated"] == 1 and stats["documents"] == 0
    assert db_session.query(Case).count() == 1
    assert db_session.query(Document).count() == 2


def test_bad_case_is_reported_and_others_import(db_session, seeded, tmp_path):
    bad = {**CASE, "case_number": "2024/102", "case_type": "uzay_hukuku", "documents": []}
    good = {**CASE, "documents": []}
    _write(tmp_path, [bad, good])
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 1
    assert len(stats["errors"]) == 1 and "uzay_hukuku" in stats["errors"][0]
    assert db_session.query(Case).one().case_number == "2024/101"


def test_missing_document_file_is_an_error(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": [{"file": "yok.pdf"}]}])
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 0 and "yok.pdf" in stats["errors"][0]


def test_precedent_import_keeps_documents_but_has_no_firm_case_owner(db_session, seeded, tmp_path):
    _write(tmp_path, [CASE], {"karar.txt": b"Karar metni"}, record_kind="precedent")
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 1
    precedent = db_session.query(Case).one()
    assert precedent.is_precedent is True
    assert precedent.assigned_lawyer_id is None
    assert db_session.query(Document).count() == 2
    assert import_folder(str(tmp_path), db=db_session)["updated"] == 1


def test_precedent_import_does_not_overwrite_a_firm_case(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "client_name": "Gerçek Müvekkil", "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    _write(tmp_path, [{**CASE, "documents": []}], record_kind="precedent")
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["updated"] == 0
    assert "different record kind" in stats["errors"][0]
    assert db_session.query(Case).one().is_precedent is False


def test_precedent_import_reclassifies_legacy_anonymous_row(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    assert db_session.query(Case).one().assigned_lawyer_id is not None
    _write(tmp_path, [{**CASE, "documents": []}], record_kind="precedent")
    assert import_folder(str(tmp_path), db=db_session)["updated"] == 1
    db_session.expire_all()
    case = db_session.query(Case).one()
    assert case.is_precedent is True
    assert case.assigned_lawyer_id is None


def test_seed_real_data_mode_removes_demo_cases(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker

    from app.core.config import settings
    from app.db import seed as seed_module

    engine = db_session.get_bind()
    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(seed_module, "upgrade_to_head", lambda engine: None)  # db_session already has the tables
    monkeypatch.setattr(settings, "seed_demo_data", True)

    seed_module.seed()
    assert db_session.query(Case).count() == len(seed_module.DEMO_CASES)

    real = Case(law_firm_id=db_session.query(Case).first().law_firm_id, case_number="GERCEK/1",
                case_name="Gerçek", client_name="Müvekkil", case_type=CaseType.DIGER)
    db_session.add(real)
    db_session.commit()

    monkeypatch.setattr(settings, "seed_demo_data", False)
    seed_module.seed()
    db_session.expire_all()
    assert [c.case_number for c in db_session.query(Case).all()] == ["GERCEK/1"]
    assert db_session.query(Document).count() == 0


def _party_rows(db_session):
    return [(p.name, p.role, p.is_client, p.sort_order) for p in db_session.query(CaseParty).order_by(CaseParty.sort_order).all()]


def test_import_creates_client_and_opposing_parties(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    assert _party_rows(db_session) == [("Davacı (anonim)", "other", True, 0), ("Davalı Şirket", "other", False, 1)]


def test_reimport_keeps_edited_parties_while_the_names_are_unchanged(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    case = db_session.query(Case).one()
    case.parties = [CaseParty(law_firm_id=case.law_firm_id, name="Davacı (anonim)", role="plaintiff", is_client=True, sort_order=0)]
    db_session.commit()

    import_folder(str(tmp_path), db=db_session)

    assert _party_rows(db_session) == [("Davacı (anonim)", "plaintiff", True, 0)]


def test_reimport_with_changed_names_resets_the_parties(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    _write(tmp_path, [{**CASE, "client_name": "Yeni Müvekkil", "opposing_party": None, "documents": []}])

    import_folder(str(tmp_path), db=db_session)

    assert _party_rows(db_session) == [("Yeni Müvekkil", "other", True, 0)]


def test_reimport_keeps_parties_edited_through_the_api(db_session, seeded, tmp_path):
    from app.schemas.case import CasePartyIn, CaseUpdate
    from app.services.case_service import CaseService

    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    case = db_session.query(Case).one()
    CaseService(db_session).update_case(case, CaseUpdate(parties=[
        CasePartyIn(name="Davacı (anonim)", role="plaintiff", is_client=True),
        CasePartyIn(name="Davalı Şirket", role="defendant"),
        CasePartyIn(name="İkinci Davalı", role="defendant", counsel_name="Av. Can"),
    ]))

    import_folder(str(tmp_path), db=db_session)

    assert _party_rows(db_session) == [
        ("Davacı (anonim)", "plaintiff", True, 0),
        ("Davalı Şirket", "defendant", False, 1),
        ("İkinci Davalı", "defendant", False, 2),
    ]
    db_session.refresh(case)
    assert case.client_name == "Davacı (anonim)"
    assert case.opposing_party == "Davalı Şirket, İkinci Davalı"


def test_reimport_with_changed_names_rewrites_untouched_legacy_parties(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    _write(tmp_path, [{**CASE, "opposing_party": "Başka Şirket", "documents": []}])

    import_folder(str(tmp_path), db=db_session)

    assert _party_rows(db_session) == [("Davacı (anonim)", "other", True, 0), ("Başka Şirket", "other", False, 1)]


def test_reimport_after_only_a_client_role_patch_keeps_the_opposing_party(db_session, seeded, tmp_path):
    from app.schemas.case import CaseUpdate
    from app.services.case_service import CaseService

    _write(tmp_path, [{**CASE, "documents": []}])
    import_folder(str(tmp_path), db=db_session)
    case = db_session.query(Case).one()
    CaseService(db_session).update_case(case, CaseUpdate(client_role="plaintiff"))

    import_folder(str(tmp_path), db=db_session)

    db_session.refresh(case)
    assert case.client_name == "Davacı (anonim)"
    assert case.opposing_party == "Davalı Şirket"


# --- next_hearing_date is a hearing event ---------------------------------------------------

def _hearings(db):
    from app.models.calendar import CalendarEvent, CalendarEventType

    return db.query(CalendarEvent).filter(CalendarEvent.event_type == CalendarEventType.HEARING).order_by(CalendarEvent.starts_at).all()


def test_next_hearing_date_becomes_an_all_day_hearing_event(db_session, seeded, tmp_path):
    from datetime import datetime, timedelta

    from app.core.timeutil import local_today

    day = local_today() + timedelta(days=12)
    _write(tmp_path, [{**CASE, "status": "devam_eden", "outcome": "ongoing", "next_hearing_date": day.isoformat(), "documents": []}])

    import_folder(str(tmp_path), db=db_session)

    case = db_session.query(Case).one()
    [event] = _hearings(db_session)
    assert case.next_hearing_date == day
    assert (event.case_id, event.title, event.all_day, event.starts_at) == (case.id, "Duruşma", True, datetime.combine(day, datetime.min.time()))
    assert (event.assignee_id, event.created_by, event.law_firm_id) == (case.assigned_lawyer_id, case.assigned_lawyer_id, case.law_firm_id)
    assert event.reminder_days == [3, 1]


def test_reimport_never_adds_a_second_hearing_on_the_same_day(db_session, seeded, tmp_path):
    from datetime import datetime, timedelta

    from app.core.timeutil import local_today
    from app.models.calendar import CalendarEvent, CalendarEventType

    day = local_today() + timedelta(days=12)
    item = {**CASE, "status": "devam_eden", "outcome": "ongoing", "next_hearing_date": day.isoformat(), "documents": []}
    _write(tmp_path, [item])
    import_folder(str(tmp_path), db=db_session)
    import_folder(str(tmp_path), db=db_session)
    assert len(_hearings(db_session)) == 1

    # A timed hearing the lawyer set up in the calendar counts as the hearing of that day.
    case = db_session.query(Case).one()
    other_day = day + timedelta(days=3)
    db_session.add(CalendarEvent(law_firm_id=case.law_firm_id, title="Duruşma", event_type=CalendarEventType.HEARING,
                                 starts_at=datetime.combine(other_day, datetime.min.time()).replace(hour=14), all_day=False,
                                 duration_minutes=60, case_id=case.id, created_by=case.assigned_lawyer_id, reminder_days=[]))
    db_session.commit()
    _write(tmp_path, [{**item, "next_hearing_date": other_day.isoformat()}])
    import_folder(str(tmp_path), db=db_session)

    assert len(_hearings(db_session)) == 2
    db_session.refresh(case)
    assert case.next_hearing_date == day  # the earliest upcoming one, not the last imported


def test_a_past_hearing_date_stays_as_history_and_a_reimport_without_one_keeps_the_events(db_session, seeded, tmp_path):
    from datetime import timedelta

    from app.core.timeutil import local_today

    past = local_today() - timedelta(days=3)
    item = {**CASE, "next_hearing_date": past.isoformat(), "documents": []}
    _write(tmp_path, [item])
    import_folder(str(tmp_path), db=db_session)
    case = db_session.query(Case).one()
    assert case.next_hearing_date is None and len(_hearings(db_session)) == 1

    _write(tmp_path, [{key: value for key, value in item.items() if key != "next_hearing_date"}])
    import_folder(str(tmp_path), db=db_session)

    assert len(_hearings(db_session)) == 1


def test_precedent_hearing_dates_are_not_turned_into_events(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "next_hearing_date": "2099-01-05", "documents": []}], record_kind="precedent")

    import_folder(str(tmp_path), db=db_session)

    assert _hearings(db_session) == []
