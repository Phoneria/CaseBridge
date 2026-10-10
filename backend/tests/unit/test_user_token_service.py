"""One-time tokens: only the digest is stored, they expire, work once, and a
newer token of the same purpose replaces the older one."""
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import password_epoch
from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import (
    consume_token,
    find_usable_token,
    hash_token,
    invalidate_unused_tokens,
    issue_token,
)


@pytest.fixture()
def user(db_session):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="a@example.com", hashed_password="x", full_name="Ad Soyad")
    db_session.add(user)
    db_session.commit()
    return user


def test_issue_token_stores_only_the_sha256_digest(db_session, user):
    raw = issue_token(db_session, user, TokenPurpose.INVITE, created_by=user.id)
    db_session.commit()

    row = db_session.query(UserToken).one()
    assert len(raw) >= 43
    assert row.token_hash == hash_token(raw) and len(row.token_hash) == 64
    assert raw not in (row.token_hash, row.user_id, row.purpose)
    assert (row.user_id, row.law_firm_id, row.purpose, row.created_by) == (user.id, user.law_firm_id, "invite", user.id)
    assert row.used_at is None


def test_lifetimes_follow_the_settings(db_session, user, monkeypatch):
    monkeypatch.setattr(settings, "invite_token_hours", 72)
    monkeypatch.setattr(settings, "reset_token_minutes", 60)
    before = utc_now()
    issue_token(db_session, user, TokenPurpose.INVITE)
    issue_token(db_session, user, TokenPurpose.RESET)
    after = utc_now()

    invite = db_session.query(UserToken).filter_by(purpose="invite").one()
    reset = db_session.query(UserToken).filter_by(purpose="reset").one()
    assert before + timedelta(hours=72) <= invite.expires_at <= after + timedelta(hours=72)
    assert before + timedelta(minutes=60) <= reset.expires_at <= after + timedelta(minutes=60)


def test_a_new_token_invalidates_the_older_unused_one_of_the_same_purpose(db_session, user):
    first = issue_token(db_session, user, TokenPurpose.RESET)
    other_purpose = issue_token(db_session, user, TokenPurpose.INVITE)
    second = issue_token(db_session, user, TokenPurpose.RESET)
    db_session.commit()

    assert find_usable_token(db_session, first) is None
    assert find_usable_token(db_session, second) is not None
    assert find_usable_token(db_session, other_purpose) is not None


def test_find_usable_token_rejects_unknown_expired_used_and_inactive(db_session, user):
    assert find_usable_token(db_session, "") is None
    assert find_usable_token(db_session, "nope") is None
    assert find_usable_token(db_session, "x" * 500) is None

    raw = issue_token(db_session, user, TokenPurpose.RESET)
    db_session.commit()
    token, found_user = find_usable_token(db_session, raw)
    assert found_user.id == user.id

    token.expires_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    assert find_usable_token(db_session, raw) is None

    token.expires_at = utc_now() + timedelta(hours=1)
    user.is_active = False
    db_session.commit()
    assert find_usable_token(db_session, raw) is None


def test_a_token_can_be_consumed_only_once(db_session, user):
    raw = issue_token(db_session, user, TokenPurpose.INVITE)
    db_session.commit()
    token, _ = find_usable_token(db_session, raw)

    assert consume_token(db_session, token) is True
    assert consume_token(db_session, token) is False
    db_session.commit()
    assert find_usable_token(db_session, raw) is None


def test_invalidate_unused_tokens_by_purpose_or_all(db_session, user):
    invite = issue_token(db_session, user, TokenPurpose.INVITE)
    reset = issue_token(db_session, user, TokenPurpose.RESET)
    invalidate_unused_tokens(db_session, user.id, TokenPurpose.RESET)
    db_session.commit()
    assert find_usable_token(db_session, reset) is None
    assert find_usable_token(db_session, invite) is not None

    invalidate_unused_tokens(db_session, user.id)
    db_session.commit()
    assert find_usable_token(db_session, invite) is None


def test_password_epoch_is_the_utc_seconds_of_a_naive_datetime():
    from datetime import datetime

    assert password_epoch(datetime(2026, 10, 11, 12, 0, 0)) == 1791720000
    assert password_epoch(datetime(2026, 10, 11, 12, 0, 0, 999999)) == 1791720000
