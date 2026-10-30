"""Sessions are tied to the password (JWT "pwd" claim); invited users cannot
log in; login messages are Turkish; GET /auth/config is public."""
from datetime import timedelta

from jose import jwt
from sqlalchemy import null

from app.core.config import settings
from app.core.rate_limit import reset_all
from app.core.security import create_access_token, hash_password, password_epoch
from app.models.user import User


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_token_carries_the_password_epoch(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert claims["pwd"] == password_epoch(data["user_a"].password_set_at)
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200


def test_token_without_a_pwd_claim_is_rejected(client, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    legacy = create_access_token(subject=user.id, extra_claims={"law_firm_id": user.law_firm_id, "role": "lawyer"})

    assert client.get("/users/me", headers=_bearer(legacy)).status_code == 401


def test_token_with_a_wrong_or_malformed_pwd_claim_is_rejected(client, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    epoch = password_epoch(user.password_set_at)
    for bad in (epoch - 1, epoch + 1, str(epoch), True, None):
        token = create_access_token(subject=user.id, extra_claims={"pwd": bad})
        assert client.get("/users/me", headers=_bearer(token)).status_code == 401, bad


def test_changing_password_set_at_ends_older_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200

    user = db_session.get(User, data["user_a"].id)
    user.password_set_at = user.password_set_at + timedelta(seconds=1)
    db_session.commit()

    assert client.get("/users/me", headers=_bearer(token)).status_code == 401
    fresh = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    assert client.get("/users/me", headers=_bearer(fresh)).status_code == 200


def test_user_without_a_password_set_at_cannot_use_a_token(client, db_session, two_firms_two_users):
    user = db_session.get(User, two_firms_two_users["user_a"].id)
    token = create_access_token(subject=user.id, extra_claims={"pwd": password_epoch(user.password_set_at)})
    user.password_set_at = None
    db_session.commit()

    assert client.get("/users/me", headers=_bearer(token)).status_code == 401


def test_invited_user_cannot_log_in_even_with_the_placeholder_password(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    pending = User(
        law_firm_id=data["firm_a"].id, email="davetli@example.com",
        hashed_password=hash_password("placeholder-1234"), full_name="Davetli",
        password_set_at=null(), invited_at=None,
    )
    db_session.add(pending)
    db_session.commit()

    response = _login(client, "davetli@example.com", "placeholder-1234")
    assert response.status_code == 401
    assert response.json()["detail"] == "E-posta veya şifre hatalı."


def test_login_messages_are_turkish(client, two_firms_two_users):
    data = two_firms_two_users
    wrong = _login(client, data["user_a"].email, "yanlis-sifre")
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "E-posta veya şifre hatalı."
    assert _login(client, "kimse@example.com", "x").json()["detail"] == "E-posta veya şifre hatalı."

    reset_all()
    for _ in range(5):
        _login(client, data["user_a"].email, "yanlis-sifre")
    limited = _login(client, data["user_a"].email, "yanlis-sifre")
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin."


def test_login_ignores_the_case_of_the_email(client, two_firms_two_users):
    data = two_firms_two_users
    assert _login(client, data["user_a"].email.upper(), data["password"]).status_code == 200


def test_auth_config_is_public_and_reports_demo_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "seed_demo_data", True)
    assert client.get("/auth/config").json() == {"demo_mode": True, "platform_demo": True}
    monkeypatch.setattr(settings, "seed_demo_data", False)
    assert client.get("/auth/config").json() == {"demo_mode": False, "platform_demo": False}


def test_auth_config_platform_demo_is_never_offered_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "seed_demo_data", True)
    monkeypatch.setattr(settings, "env", "production")
    assert client.get("/auth/config").json() == {"demo_mode": True, "platform_demo": False}
