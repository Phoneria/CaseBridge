"""forgot-password, token-info, set-password and change-password."""
from datetime import timedelta

import pytest
from jose import jwt
from sqlalchemy import null

from app.core.config import settings
from app.core.rate_limit import reset_all
from app.core.security import hash_password, password_epoch, verify_password
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import hash_token, issue_token

LINK_GONE = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış."
FORGOT_OK = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi."
NEW_PASSWORD = "yeni-guclu-sifre"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


@pytest.fixture()
def pending_user(db_session, two_firms_two_users):
    user = User(
        law_firm_id=two_firms_two_users["firm_a"].id, email="davetli@example.com",
        hashed_password=hash_password("placeholder-not-usable"), full_name="Davetli Avukat",
        password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


# --- forgot-password --------------------------------------------------------

def test_forgot_password_sends_a_reset_link_to_an_active_user(client, mail_outbox, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    response = client.post("/auth/forgot-password", json={"email": user.email.upper()})

    assert response.status_code == 202
    assert response.json() == {"message": FORGOT_OK}
    [message] = mail_outbox.messages(user.email)
    assert message["Subject"] == "CaseBridge şifre sıfırlama"
    assert mail_outbox.latest_token(user.email)


def test_forgot_password_answers_the_same_and_sends_nothing_for_other_addresses(
    client, db_session, mail_outbox, two_firms_two_users, pending_user
):
    inactive = db_session.get(User, two_firms_two_users["user_b"].id)
    inactive.is_active = False
    db_session.commit()

    for email in ("nobody@example.com", pending_user.email, inactive.email):
        response = client.post("/auth/forgot-password", json={"email": email})
        assert response.status_code == 202
        assert response.json() == {"message": FORGOT_OK}
    assert mail_outbox.messages() == []
    assert db_session.query(UserToken).count() == 0


def test_forgot_password_is_limited_to_three_requests_per_address_and_ip(client, mail_outbox, two_firms_two_users):
    email = two_firms_two_users["user_a"].email
    for _ in range(3):
        assert client.post("/auth/forgot-password", json={"email": email}).status_code == 202

    limited = client.post("/auth/forgot-password", json={"email": email})
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin."
    assert client.post("/auth/forgot-password", json={"email": "other@example.com"}).status_code == 202
    assert len(mail_outbox.messages(email)) == 3


def test_forgot_password_ignores_a_failing_mail_backend(client, monkeypatch, two_firms_two_users, tmp_path):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    response = client.post("/auth/forgot-password", json={"email": two_firms_two_users["user_a"].email})
    assert response.status_code == 202


# --- token-info --------------------------------------------------------------

def test_token_info_describes_a_valid_link(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    response = client.get("/auth/token-info", params={"token": raw})
    assert response.status_code == 200
    assert response.json() == {"purpose": "invite", "email": "davetli@example.com", "full_name": "Davetli Avukat"}


def test_token_info_is_410_for_unknown_expired_used_and_inactive_links(client, db_session, pending_user):
    assert client.get("/auth/token-info", params={"token": "bilinmeyen"}).status_code == 410
    assert client.get("/auth/token-info").status_code == 410

    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()
    row = db_session.query(UserToken).filter_by(token_hash=hash_token(raw)).one()

    row.expires_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    gone = client.get("/auth/token-info", params={"token": raw})
    assert gone.status_code == 410
    assert gone.json()["detail"] == LINK_GONE

    row.expires_at = utc_now() + timedelta(hours=1)
    row.used_at = utc_now()
    db_session.commit()
    assert client.get("/auth/token-info", params={"token": raw}).status_code == 410

    row.used_at = None
    pending_user.is_active = False
    db_session.commit()
    assert client.get("/auth/token-info", params={"token": raw}).status_code == 410


# --- set-password ------------------------------------------------------------

def test_set_password_with_an_invite_sets_the_password_and_logs_in(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    response = client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert client.get("/users/me", headers=_bearer(token)).json()["email"] == "davetli@example.com"

    db_session.refresh(pending_user)
    assert pending_user.password_set_at is not None and pending_user.status.value == "active"
    assert verify_password(NEW_PASSWORD, pending_user.hashed_password)
    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert claims["pwd"] == password_epoch(pending_user.password_set_at)
    assert _login(client, "davetli@example.com", NEW_PASSWORD).status_code == 200


def test_a_link_works_only_once(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 200
    again = client.post("/auth/set-password", json={"token": raw, "password": "baska-bir-sifre-1"})
    assert again.status_code == 410
    assert again.json()["detail"] == LINK_GONE


def test_set_password_with_a_reset_link_ends_the_older_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    old_token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    raw = issue_token(db_session, data["user_a"], TokenPurpose.RESET)
    db_session.commit()

    new_token = client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).json()["access_token"]

    assert client.get("/users/me", headers=_bearer(old_token)).status_code == 401
    assert client.get("/users/me", headers=_bearer(new_token)).status_code == 200
    assert _login(client, data["user_a"].email, data["password"]).status_code == 401


def test_set_password_invalidates_the_users_other_unused_links(client, db_session, pending_user):
    invite = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    reset = issue_token(db_session, pending_user, TokenPurpose.RESET)
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": invite, "password": NEW_PASSWORD}).status_code == 200
    assert client.post("/auth/set-password", json={"token": reset, "password": "baska-bir-sifre-1"}).status_code == 410


def test_set_password_rejects_bad_links_and_keeps_the_link_after_a_rule_violation(client, db_session, pending_user):
    assert client.post("/auth/set-password", json={"token": "bilinmeyen", "password": NEW_PASSWORD}).status_code == 410

    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()
    short = client.post("/auth/set-password", json={"token": raw, "password": "kisa"})
    assert short.status_code == 422
    assert short.json()["detail"] == "Şifre en az 10 karakter olmalı."
    same = client.post("/auth/set-password", json={"token": raw, "password": pending_user.email})
    assert same.status_code == 422
    assert same.json()["detail"] == "Şifre e-posta adresinizle aynı olamaz."
    db_session.refresh(pending_user)
    assert pending_user.password_set_at is None

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 200


def test_set_password_is_410_for_an_inactive_user(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    pending_user.is_active = False
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 410


# --- change-password ---------------------------------------------------------

def test_change_password_returns_a_new_token_and_ends_other_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    first = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    other_device = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(first),
    )
    assert response.status_code == 200
    fresh = response.json()["access_token"]

    assert client.get("/users/me", headers=_bearer(fresh)).status_code == 200
    assert client.get("/users/me", headers=_bearer(first)).status_code == 401
    assert client.get("/users/me", headers=_bearer(other_device)).status_code == 401
    assert _login(client, data["user_a"].email, data["password"]).status_code == 401
    assert _login(client, data["user_a"].email, NEW_PASSWORD).status_code == 200


def test_two_password_changes_within_one_second_still_end_the_older_session(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    second = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    ).json()["access_token"]
    third = client.post(
        "/auth/change-password",
        json={"current_password": NEW_PASSWORD, "new_password": "ucuncu-sifre-123"},
        headers=_bearer(second),
    )
    assert third.status_code == 200
    assert client.get("/users/me", headers=_bearer(second)).status_code == 401


def test_change_password_rejects_a_wrong_current_password(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={"current_password": "yanlis-sifre-1", "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Mevcut şifre hatalı."
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200


def test_change_password_applies_the_password_rules(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    headers = _bearer(token)

    short = client.post("/auth/change-password", json={"current_password": data["password"], "new_password": "kisa"}, headers=headers)
    assert (short.status_code, short.json()["detail"]) == (422, "Şifre en az 10 karakter olmalı.")
    same = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": data["user_a"].email},
        headers=headers,
    )
    assert (same.status_code, same.json()["detail"]) == (422, "Şifre e-posta adresinizle aynı olamaz.")


def test_change_password_requires_login_and_limits_wrong_guesses(client, two_firms_two_users):
    assert client.post("/auth/change-password", json={"current_password": "a", "new_password": "b"}).status_code == 401

    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    reset_all()
    for _ in range(5):
        wrong = client.post(
            "/auth/change-password",
            json={"current_password": "yanlis-sifre-1", "new_password": NEW_PASSWORD},
            headers=_bearer(token),
        )
        assert wrong.status_code == 400
    limited = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    )
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin."


# --- follow-ups --------------------------------------------------------------

def test_set_password_is_410_when_the_link_is_consumed_concurrently(client, db_session, pending_user, monkeypatch):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()
    monkeypatch.setattr("app.api.routes.auth.consume_token", lambda db, row: False)

    response = client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD})
    assert response.status_code == 410
    assert response.json()["detail"] == LINK_GONE
    db_session.refresh(pending_user)
    assert pending_user.password_set_at is None


def test_deliver_never_raises_and_logs_only_the_error_type(monkeypatch, caplog):
    from app.services import account_service
    from app.services.email import EmailMessage

    def boom(message):
        raise TypeError("secret-link-token-123")

    monkeypatch.setattr(account_service, "send_email", boom)
    message = EmailMessage(to="a@example.com", subject="s", text="t")
    with caplog.at_level("WARNING", logger="casebridge"):
        assert account_service.deliver(message) is False
    assert "TypeError" in caplog.text
    assert "secret-link-token-123" not in caplog.text


def test_rate_limiter_drops_keys_without_recent_attempts(monkeypatch):
    from app.core import rate_limit

    reset_all()
    rate_limit.record_attempt("forgot:x")
    assert "forgot:x" in rate_limit._attempts
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: 10_000_000.0)
    assert rate_limit.is_rate_limited("forgot:x", 3) is False
    assert "forgot:x" not in rate_limit._attempts
    assert rate_limit.is_rate_limited("never-seen", 3) is False
    assert "never-seen" not in rate_limit._attempts
