"""Notification endpoints: status without secrets, test e-mail to the caller."""
from app.core.config import settings
from app.services.email import EmailSendError


def _auth_headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_status_reports_backend_and_reminder_settings_without_secrets(client, two_firms_two_users, monkeypatch):
    monkeypatch.setattr(settings, "smtp_password", "s3cret-pass")
    headers = _auth_headers(client, two_firms_two_users)

    response = client.get("/notifications/status", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "email_backend": "console",
        "reminders_enabled": True,
        "reminder_send_hour": 9,
        "timezone": "Europe/Istanbul",
    }
    assert "s3cret-pass" not in response.text


def test_status_requires_login(client):
    assert client.get("/notifications/status").status_code == 401


def test_test_email_is_sent_to_the_signed_in_user(client, two_firms_two_users, monkeypatch):
    sent = []
    monkeypatch.setattr("app.api.routes.notifications.send_email", sent.append)
    headers = _auth_headers(client, two_firms_two_users)

    response = client.post("/notifications/test-email", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"sent": True, "backend": "console"}
    assert len(sent) == 1
    assert sent[0].to == "avukat.a@demo.casebridge.dev"
    assert sent[0].subject == "CaseBridge test e-postası"
    assert "Merhaba Avukat A" in sent[0].text
    assert "Bu e-posta CaseBridge tarafından otomatik gönderildi." in sent[0].text


def test_test_email_failure_returns_502_with_turkish_message(client, two_firms_two_users, monkeypatch):
    def fail(message):
        raise EmailSendError("SMTPAuthenticationError")

    monkeypatch.setattr("app.api.routes.notifications.send_email", fail)
    headers = _auth_headers(client, two_firms_two_users)

    response = client.post("/notifications/test-email", headers=headers)

    assert response.status_code == 502
    assert response.json() == {"detail": "E-posta gönderilemedi. SMTP ayarlarını kontrol edin."}


def test_test_email_requires_login(client):
    assert client.post("/notifications/test-email").status_code == 401
