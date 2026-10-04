"""Seed script must be idempotent and create login-capable demo users."""
from pathlib import Path
from app.core.security import verify_password
from app.db.seed import (
    ADMIN_EMAIL,
    DEMO_DOCUMENTS,
    DEMO_EVENTS,
    DEMO_LAWYERS,
    DEMO_PASSWORD,
    DEMO_TASKS,
    TICARI_KIRA_DOCUMENTS,
    TICARI_KIRA_EVENTS,
    TICARI_KIRA_TASKS,
    seed,
)
from app.db.demo_case_detail_seed import CASE_EVIDENCE
from app.models.case import Case, CaseEvent
from app.models.courtroom import CourtroomActor, CourtroomSession
from app.models.document import Document
from app.models.law_firm import LawFirm
from app.models.task import Task
from app.models.user import User


def test_seed_creates_demo_firm_users_and_cases(db_session, monkeypatch, tmp_path):
    import app.db.seed as seed_module

    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module.Base.metadata, "create_all", lambda bind=None: None)
    monkeypatch.setattr(seed_module.settings, "storage_dir", str(tmp_path))

    seed()

    firm = db_session.query(LawFirm).one()
    users = db_session.query(User).filter(User.law_firm_id == firm.id).all()
    emails = {u.email for u in users}
    assert emails == {ADMIN_EMAIL, *(email for email, *_ in DEMO_LAWYERS)}

    admin = next(u for u in users if u.email == ADMIN_EMAIL)
    assert verify_password(DEMO_PASSWORD, admin.hashed_password)

    cases = db_session.query(Case).filter(Case.law_firm_id == firm.id).all()
    assert len(cases) == 20
    assert sum(c.status.value != "kapali" for c in cases) == 12
    assert sum(c.outcome.value == "won" for c in cases) == 5
    assert sum(c.outcome.value == "lost" for c in cases) == 3
    assert any(c.outcome.value == "lost" for c in cases)
    assert db_session.query(Task).count() == len(DEMO_TASKS) + len(TICARI_KIRA_TASKS) + 3 * len(CASE_EVIDENCE)
    assert db_session.query(Document).count() == len(DEMO_DOCUMENTS) + len(TICARI_KIRA_DOCUMENTS) + 2 * len(CASE_EVIDENCE)
    assert db_session.query(CaseEvent).count() == len(DEMO_EVENTS) + len(TICARI_KIRA_EVENTS) + 3 * len(CASE_EVIDENCE)
    for case in cases:
        assert db_session.query(Task).filter_by(case_id=case.id).count() >= 3
        assert db_session.query(Document).filter_by(case_id=case.id).count() >= 2
        assert db_session.query(CaseEvent).filter_by(case_id=case.id).count() >= 3
    case_201 = next(case for case in cases if case.case_number == "2025/201")
    notes = db_session.query(Document).filter_by(case_id=case_201.id).all()
    assert any("Gerekçeli kabul kararı" in (note.extracted_text or "") for note in notes)
    assert all("DEMO" in (note.extracted_text or "") for note in notes)
    assert all(Path(note.storage_path).is_file() for note in notes)
    showcases = db_session.query(CourtroomSession).filter_by(prompt_version="showcase-v1").all()
    assert len(showcases) == 24
    assert all(sum(session.user_id == user.id for session in showcases) == 6 for user in users)
    assert all(session.status.value == "completed" and session.evaluation is not None for session in showcases)
    assert all(len(session.turns) == 19 for session in showcases)
    assert all({CourtroomActor.USER, CourtroomActor.OPPONENT, CourtroomActor.JUDGE}.issubset({turn.actor for turn in session.turns}) for session in showcases)


def test_seed_is_idempotent(db_session, monkeypatch, tmp_path):
    import app.db.seed as seed_module

    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module.Base.metadata, "create_all", lambda bind=None: None)
    monkeypatch.setattr(seed_module.settings, "storage_dir", str(tmp_path))

    seed()
    seed()

    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).count() == 4
    assert db_session.query(Case).count() == 20
    assert db_session.query(Task).count() == len(DEMO_TASKS) + len(TICARI_KIRA_TASKS) + 3 * len(CASE_EVIDENCE)
    assert db_session.query(Document).count() == len(DEMO_DOCUMENTS) + len(TICARI_KIRA_DOCUMENTS) + 2 * len(CASE_EVIDENCE)
    assert db_session.query(CaseEvent).count() == len(DEMO_EVENTS) + len(TICARI_KIRA_EVENTS) + 3 * len(CASE_EVIDENCE)
    assert db_session.query(CourtroomSession).filter_by(prompt_version="showcase-v1").count() == 24
