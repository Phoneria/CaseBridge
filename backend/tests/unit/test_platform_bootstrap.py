"""PLATFORM_ADMIN_EMAILS: platform admins are created and invited once; a
running invite is not re-sent, an expired or failed one is; addresses of
customer firms are never touched; startup never fails because of it."""
import logging
from datetime import timedelta

from app.core.config import settings
from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.user_token import UserToken
from app.services import platform_bootstrap
from app.services.platform_bootstrap import (
    PLATFORM_ADMIN_NAME,
    ensure_platform_admins,
    parse_platform_admin_emails,
    run_platform_bootstrap,
)

OPS = "ops@casebridge.example.com"


def test_parse_lowercases_trims_drops_duplicates_and_invalid_addresses():
    raw = " Ops@CaseBridge.example.com, ops@casebridge.example.com ,, gecersiz , ekip@casebridge.example.com"
    assert parse_platform_admin_emails(raw) == [OPS, "ekip@casebridge.example.com"]
    assert parse_platform_admin_emails("") == []


def test_an_invalid_entry_is_reported_by_position_not_by_address(caplog):
    raw = " Ops@CaseBridge.example.com, ops@casebridge.example.com ,, gecersiz@ , ekip@casebridge.example.com"
    with caplog.at_level(logging.WARNING, logger="casebridge"):
        parse_platform_admin_emails(raw)

    messages = [r.getMessage() for r in caplog.records]
    assert messages == ["PLATFORM_ADMIN_EMAILS: 4. adres geçersiz olduğu için atlandı."]
    assert "gecersiz" not in caplog.text


def test_an_empty_list_creates_nothing(db_session):
    ensure_platform_admins(db_session, [])
    assert db_session.query(LawFirm).count() == 0


def test_creates_the_platform_firm_and_an_invited_platform_admin(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])

    user = db_session.query(User).filter_by(email=OPS).one()
    assert user.law_firm.is_platform is True
    assert (user.role, user.is_platform_admin, user.full_name) == (UserRole.ADMIN, True, PLATFORM_ADMIN_NAME)
    assert user.password_set_at is None and user.invited_at is not None
    assert len(mail_outbox.messages(to=OPS)) == 1


def test_running_again_sends_no_new_e_mail(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])
    ensure_platform_admins(db_session, [OPS])

    assert db_session.query(User).filter_by(email=OPS).count() == 1
    assert db_session.query(LawFirm).filter_by(is_platform=True).count() == 1
    assert len(mail_outbox.messages(to=OPS)) == 1


def test_an_expired_invite_is_sent_again(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])
    for token in db_session.query(UserToken).all():
        token.expires_at = utc_now() - timedelta(minutes=1)
    db_session.commit()

    ensure_platform_admins(db_session, [OPS])

    assert len(mail_outbox.messages(to=OPS)) == 2


def test_a_failed_e_mail_is_retried_on_the_next_start(db_session, mail_outbox, monkeypatch):
    real_deliver = platform_bootstrap.deliver
    failing = {"on": True}
    monkeypatch.setattr(platform_bootstrap, "deliver", lambda message: False if failing["on"] else real_deliver(message))

    ensure_platform_admins(db_session, [OPS])
    assert mail_outbox.messages(to=OPS) == []

    failing["on"] = False
    ensure_platform_admins(db_session, [OPS])

    assert len(mail_outbox.messages(to=OPS)) == 1


def test_an_address_of_a_customer_firm_is_left_alone(db_session, office, mail_outbox, caplog):
    with caplog.at_level(logging.WARNING, logger="casebridge"):
        ensure_platform_admins(db_session, [OPS, office.admin_a.email])

    messages = [r.getMessage() for r in caplog.records]
    assert messages == ["PLATFORM_ADMIN_EMAILS: 2. adres bir müşteri bürosunda kayıtlı olduğu için atlandı."]
    assert office.admin_a.email not in caplog.text

    db_session.refresh(office.admin_a)
    assert office.admin_a.is_platform_admin is False
    assert office.admin_a.law_firm_id == office.firm_a.id
    assert mail_outbox.messages(to=office.admin_a.email) == []


def test_a_platform_firm_user_without_the_flag_gets_it(db_session, mail_outbox):
    from app.services.platform_service import get_or_create_platform_firm

    firm = get_or_create_platform_firm(db_session)
    user = User(law_firm_id=firm.id, email=OPS, hashed_password="x", full_name="Ops", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.commit()

    ensure_platform_admins(db_session, [OPS])

    db_session.refresh(user)
    assert user.is_platform_admin is True
    assert mail_outbox.messages(to=OPS) == []  # the password is already set


def test_the_startup_hook_never_raises(db_session, monkeypatch):
    monkeypatch.setattr(settings, "platform_admin_emails", OPS)
    monkeypatch.setattr(platform_bootstrap, "SessionLocal", lambda: db_session)

    def boom(db, emails):
        raise RuntimeError("veritabanı yok")

    monkeypatch.setattr(platform_bootstrap, "ensure_platform_admins", boom)

    run_platform_bootstrap()  # must not raise
