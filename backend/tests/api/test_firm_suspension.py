"""A suspended firm's users cannot sign in, keep a session, use a link or get
a reset e-mail; other firms are not affected."""
from app.core.timeutil import utc_now
from app.models.user_token import TokenPurpose
from app.services.firm_access import FIRM_SUSPENDED
from app.services.user_token_service import issue_token


def _suspend(db_session, firm):
    firm.is_active = False
    firm.suspended_at = utc_now()
    db_session.commit()


def test_the_right_password_gets_the_suspension_message(client, db_session, office):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": office.password})

    assert response.status_code == 403
    assert response.json()["detail"] == FIRM_SUSPENDED


def test_a_wrong_password_still_gets_the_plain_401(client, db_session, office):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": "yanlis-sifre-1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "E-posta veya şifre hatalı."


def test_open_sessions_end_when_the_firm_is_suspended(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    assert client.get("/users/me", headers=headers).status_code == 200

    _suspend(db_session, office.firm_a)

    response = client.get("/users/me", headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == FIRM_SUSPENDED


def test_other_firms_keep_working(client, db_session, office, auth_headers):
    _suspend(db_session, office.firm_a)

    assert client.get("/users/me", headers=auth_headers(office.lawyer_b)).status_code == 200


def test_links_stop_working(client, db_session, office):
    token = issue_token(db_session, office.lawyer_a1, TokenPurpose.RESET)
    db_session.commit()
    _suspend(db_session, office.firm_a)

    assert client.get("/auth/token-info", params={"token": token}).status_code == 410
    response = client.post("/auth/set-password", json={"token": token, "password": "Yeni-Sifre-2026"})
    assert response.status_code == 410


def test_forgot_password_answers_the_same_but_sends_nothing(client, db_session, office, mail_outbox):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/forgot-password", json={"email": office.lawyer_a1.email})

    assert response.status_code == 202
    assert mail_outbox.messages(to=office.lawyer_a1.email) == []


def test_activating_again_restores_access(client, db_session, office):
    _suspend(db_session, office.firm_a)
    office.firm_a.is_active = True
    office.firm_a.suspended_at = None
    db_session.commit()

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": office.password})
    assert response.status_code == 200
