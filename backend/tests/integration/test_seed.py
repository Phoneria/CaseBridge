"""Seed script must be idempotent and create login-capable demo users."""
from app.core.security import verify_password
from app.db.seed import ADMIN_EMAIL, DEMO_PASSWORD, LAWYER_EMAIL, seed
from app.models.case import Case, CaseEvent
from app.models.document import Document
from app.models.law_firm import LawFirm
from app.models.task import Task
from app.models.user import User


def test_seed_creates_demo_firm_users_and_cases(db_session, monkeypatch):
    import app.db.seed as seed_module

    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module.Base.metadata, "create_all", lambda bind=None: None)

    seed()

    firm = db_session.query(LawFirm).one()
    users = db_session.query(User).filter(User.law_firm_id == firm.id).all()
    emails = {u.email for u in users}
    assert emails == {ADMIN_EMAIL, LAWYER_EMAIL}

    admin = next(u for u in users if u.email == ADMIN_EMAIL)
    assert verify_password(DEMO_PASSWORD, admin.hashed_password)

    cases = db_session.query(Case).filter(Case.law_firm_id == firm.id).all()
    assert len(cases) == 20
    assert sum(c.status.value != "kapali" for c in cases) == 12
    assert sum(c.outcome.value == "won" for c in cases) == 5
    assert sum(c.outcome.value == "lost" for c in cases) == 3
    assert any(c.outcome.value == "lost" for c in cases)
    assert db_session.query(Task).count() == 10
    assert db_session.query(Document).count() == 8
    assert db_session.query(CaseEvent).count() == 8


def test_seed_is_idempotent(db_session, monkeypatch):
    import app.db.seed as seed_module

    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module.Base.metadata, "create_all", lambda bind=None: None)

    seed()
    seed()

    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).count() == 2
    assert db_session.query(Case).count() == 20
    assert db_session.query(Task).count() == 10
    assert db_session.query(Document).count() == 8
    assert db_session.query(CaseEvent).count() == 8
