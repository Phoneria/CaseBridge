"""Login does the same bcrypt work whether or not the account can sign in,
so response time does not reveal which e-mail addresses are registered."""
import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.services import auth_service
from app.services.auth_service import AuthService


@pytest.fixture()
def calls(monkeypatch):
    seen = []
    real = auth_service.verify_password

    def spy(password, hashed):
        seen.append((password, hashed))
        return real(password, hashed)

    monkeypatch.setattr(auth_service, "verify_password", spy)
    return seen


@pytest.fixture()
def firm(db_session):
    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.flush()
    return firm


def _user(db_session, firm, email, **kwargs):
    user = User(law_firm_id=firm.id, email=email, hashed_password=hash_password("dogru-sifre-123"),
                full_name="Ad", role=UserRole.LAWYER, **kwargs)
    db_session.add(user)
    db_session.commit()
    return user


def test_unknown_email_still_runs_a_password_check(db_session, calls):
    assert AuthService(db_session).authenticate("yok@example.com", "dogru-sifre-123") is None
    assert len(calls) == 1 and calls[0][1] == auth_service.DUMMY_PASSWORD_HASH


def test_inactive_user_runs_the_dummy_check_and_is_refused(db_session, firm, calls):
    _user(db_session, firm, "pasif@example.com", is_active=False)
    assert AuthService(db_session).authenticate("pasif@example.com", "dogru-sifre-123") is None
    assert len(calls) == 1 and calls[0][1] == auth_service.DUMMY_PASSWORD_HASH


def test_pending_user_runs_the_dummy_check_and_is_refused(db_session, firm, calls):
    _user(db_session, firm, "davetli@example.com", is_active=True, password_set_at=null())
    assert AuthService(db_session).authenticate("davetli@example.com", "dogru-sifre-123") is None
    assert len(calls) == 1 and calls[0][1] == auth_service.DUMMY_PASSWORD_HASH


def test_active_user_is_checked_against_their_own_hash(db_session, firm, calls):
    user = _user(db_session, firm, "aktif@example.com", is_active=True)
    assert AuthService(db_session).authenticate("aktif@example.com", "dogru-sifre-123").id == user.id
    assert calls == [("dogru-sifre-123", user.hashed_password)]


def test_the_dummy_hash_is_a_bcrypt_digest_with_the_default_cost():
    other = hash_password("x")
    assert auth_service.DUMMY_PASSWORD_HASH.startswith(other[:7])
