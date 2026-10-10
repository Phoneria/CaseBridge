"""users.password_set_at / invited_at and the derived status; user_tokens table."""
from datetime import timedelta

import pytest
from sqlalchemy import null
from sqlalchemy.exc import IntegrityError

from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole, UserStatus
from app.models.user_token import TokenPurpose, UserToken


@pytest.fixture()
def firm(db_session):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    return firm


def _user(firm, email, **kwargs):
    return User(law_firm_id=firm.id, email=email, hashed_password="x", full_name="Ad Soyad", **kwargs)


def test_user_without_password_set_at_counts_as_password_set_now(db_session, firm):
    user = _user(firm, "a@example.com")
    db_session.add(user)
    db_session.commit()

    assert user.password_set_at is not None
    assert user.password_set_at.microsecond == 0
    assert abs(utc_now() - user.password_set_at) < timedelta(seconds=5)
    assert user.invited_at is None
    assert user.status == UserStatus.ACTIVE


def test_invited_user_is_created_with_a_null_password_set_at(db_session, firm):
    user = _user(firm, "b@example.com", password_set_at=null(), invited_at=utc_now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.password_set_at is None
    assert user.status == UserStatus.PENDING


def test_status_is_derived_from_is_active_and_password_set_at(db_session, firm):
    pending = _user(firm, "c@example.com", password_set_at=null())
    inactive_pending = _user(firm, "d@example.com", password_set_at=null(), is_active=False)
    inactive = _user(firm, "e@example.com", is_active=False)
    db_session.add_all([pending, inactive_pending, inactive])
    db_session.commit()

    assert pending.status == UserStatus.PENDING
    assert inactive_pending.status == UserStatus.INACTIVE
    assert inactive.status == UserStatus.INACTIVE
    assert UserStatus.PENDING.value == "pending"


def test_user_token_stores_a_unique_digest(db_session, firm):
    user = _user(firm, "f@example.com", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.flush()
    expires = utc_now() + timedelta(hours=1)
    db_session.add(UserToken(
        user_id=user.id, law_firm_id=firm.id, purpose=TokenPurpose.INVITE.value,
        token_hash="a" * 64, expires_at=expires,
    ))
    db_session.commit()
    stored = db_session.query(UserToken).one()
    assert stored.used_at is None and stored.created_by is None and stored.created_at is not None

    db_session.add(UserToken(
        user_id=user.id, law_firm_id=firm.id, purpose=TokenPurpose.RESET.value,
        token_hash="a" * 64, expires_at=expires,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
