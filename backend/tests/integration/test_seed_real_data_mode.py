"""SEED_DEMO_DATA=false: no demo firm or users; an earlier demo is removed
without touching other firms, and demo accounts with real work are kept."""
import pytest

from app.core.config import settings
from app.core.security import hash_password
from app.db import seed as seed_module
from app.models.calendar import CalendarEvent
from app.models.case import Case, CaseType
from app.models.courtroom import CourtroomSession
from app.models.law_firm import LawFirm
from app.models.task import Task
from app.models.user import User, UserRole


@pytest.fixture()
def run_seed(db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module, "upgrade_to_head", lambda engine: None)
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))

    def _run(demo: bool):
        monkeypatch.setattr(settings, "seed_demo_data", demo)
        seed_module.seed()
        db_session.expire_all()

    return _run


def test_real_data_mode_on_an_empty_database_creates_no_firm_and_no_users(run_seed, db_session, capsys):
    run_seed(False)

    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(Case).count() == 0
    out = capsys.readouterr().out
    assert "real data mode" in out and "python -m app.db.create_admin" in out


def test_real_data_mode_removes_an_earlier_demo_completely(run_seed, db_session):
    run_seed(True)
    assert db_session.query(User).count() == 4 and db_session.query(CourtroomSession).count() == 24

    run_seed(False)

    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(Case).count() == 0
    assert db_session.query(CalendarEvent).count() == 0  # the demo hearings go with their cases
    assert db_session.query(CourtroomSession).count() == 0
    run_seed(False)  # idempotent


def test_other_firms_and_their_users_are_never_touched(run_seed, db_session):
    other = LawFirm(name="Kaya Hukuk")
    db_session.add(other)
    db_session.flush()
    owner = User(law_firm_id=other.id, email="admin@kaya.example.com", hashed_password=hash_password("x"),
                 full_name="Kaya Yönetici", role=UserRole.ADMIN)
    db_session.add(owner)
    db_session.flush()
    db_session.add(Case(law_firm_id=other.id, case_number="2026/77", case_name="Kaya Davası", client_name="M",
                        case_type=CaseType.KIRA, assigned_lawyer_id=owner.id))
    db_session.commit()
    run_seed(True)

    run_seed(False)

    assert [f.name for f in db_session.query(LawFirm).all()] == ["Kaya Hukuk"]
    assert [u.email for u in db_session.query(User).all()] == ["admin@kaya.example.com"]
    assert [c.case_number for c in db_session.query(Case).all()] == ["2026/77"]


def test_demo_accounts_with_real_work_are_kept_and_the_rest_removed(run_seed, db_session, capsys):
    run_seed(True)
    emre = db_session.query(User).filter_by(email=seed_module.LAWYER_EMAIL).one()
    firm = emre.law_firm
    real = Case(law_firm_id=firm.id, case_number="GERCEK/1", case_name="Gerçek", client_name="Müvekkil",
                case_type=CaseType.KIRA, assigned_lawyer_id=emre.id)
    db_session.add(real)
    db_session.commit()
    capsys.readouterr()

    run_seed(False)

    assert [u.email for u in db_session.query(User).all()] == [seed_module.LAWYER_EMAIL]
    assert [c.case_number for c in db_session.query(Case).all()] == ["GERCEK/1"]
    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(Task).count() == 0
    assert f"Demo users kept (they own records): {seed_module.LAWYER_EMAIL}" in capsys.readouterr().out


def test_demo_mode_still_creates_the_demo_accounts(run_seed, db_session):
    run_seed(True)

    assert {u.email for u in db_session.query(User).all()} == {
        seed_module.ADMIN_EMAIL, *(email for email, *_ in seed_module.DEMO_LAWYERS),
    }
    assert all(u.password_set_at is not None for u in db_session.query(User).all())


def test_kept_demo_accounts_lose_the_demo_password_and_become_pending(run_seed, db_session, client, capsys):
    from app.models.user import UserStatus
    from app.models.user_token import TokenPurpose, UserToken
    from app.services.user_token_service import issue_token

    run_seed(True)
    admin = db_session.query(User).filter_by(email=seed_module.ADMIN_EMAIL).one()
    assert client.post("/auth/login", json={"email": admin.email, "password": seed_module.DEMO_PASSWORD}).status_code == 200
    old_hash = admin.hashed_password
    db_session.add(Case(law_firm_id=admin.law_firm_id, case_number="GERCEK/2", case_name="Gerçek", client_name="M",
                        case_type=CaseType.KIRA, assigned_lawyer_id=admin.id))
    issue_token(db_session, admin, TokenPurpose.RESET)
    db_session.commit()
    capsys.readouterr()

    run_seed(False)

    kept = db_session.query(User).filter_by(email=seed_module.ADMIN_EMAIL).one()
    assert kept.is_active is True
    assert kept.password_set_at is None and kept.status == UserStatus.PENDING
    assert kept.hashed_password != old_hash
    assert db_session.query(UserToken).filter(UserToken.user_id == kept.id, UserToken.used_at.is_(None)).count() == 0
    response = client.post("/auth/login", json={"email": kept.email, "password": seed_module.DEMO_PASSWORD})
    assert response.status_code == 401
    assert f"Şifresi geçersiz kılınan demo hesabı: {seed_module.ADMIN_EMAIL}" in capsys.readouterr().out
