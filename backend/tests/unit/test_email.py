"""E-mail layer: console logging without body, SMTP via a fake smtplib.SMTP."""
import logging
import smtplib

import pytest

from app.core.config import settings
from app.services.email import EmailMessage, EmailSendError, send_email

MESSAGE = EmailMessage(
    to="avukat@demo.casebridge.dev",
    subject="Hatırlatma: yarın Duruşma – Kira Davası",
    text="GIZLI-GOVDE metni",
    html="<p>GIZLI-GOVDE</p>",
)


class FakeSMTP:
    instances: list["FakeSMTP"] = []
    fail_with: Exception | None = None

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list = []
        self.sent = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, username, password):
        self.calls.append(("login", username, password))

    def send_message(self, message):
        if FakeSMTP.fail_with is not None:
            raise FakeSMTP.fail_with
        self.calls.append("send")
        self.sent = message


@pytest.fixture()
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.fail_with = None
    monkeypatch.setattr("app.services.email.smtplib.SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "email_backend", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_port", 2525)
    monkeypatch.setattr(settings, "smtp_timeout_seconds", 7)
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_username", "mailer")
    monkeypatch.setattr(settings, "smtp_password", "s3cret-pass")
    return FakeSMTP


def test_console_backend_logs_recipient_and_subject_but_not_body(monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(MESSAGE)
    assert "avukat@demo.casebridge.dev" in caplog.text
    assert "Hatırlatma: yarın Duruşma – Kira Davası" in caplog.text
    assert "GIZLI-GOVDE" not in caplog.text


def test_smtp_backend_uses_starttls_login_and_sends(fake_smtp):
    send_email(MESSAGE)

    smtp = fake_smtp.instances[0]
    assert (smtp.host, smtp.port, smtp.timeout) == ("smtp.example.test", 2525, 7)
    assert smtp.calls == ["starttls", ("login", "mailer", "s3cret-pass"), "send"]
    assert smtp.sent["To"] == "avukat@demo.casebridge.dev"
    assert smtp.sent["From"] == settings.smtp_from
    assert smtp.sent["Subject"] == MESSAGE.subject
    assert "GIZLI-GOVDE metni" in smtp.sent.get_body(preferencelist=("plain",)).get_content()
    assert "<p>GIZLI-GOVDE</p>" in smtp.sent.get_body(preferencelist=("html",)).get_content()


def test_smtp_backend_without_tls_or_username_only_sends(fake_smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_use_tls", False)
    monkeypatch.setattr(settings, "smtp_username", "")
    send_email(MESSAGE)
    assert fake_smtp.instances[0].calls == ["send"]


def test_smtp_failure_raises_content_free_error_and_never_logs_password(fake_smtp, caplog):
    fake_smtp.fail_with = smtplib.SMTPServerDisconnected("connection closed by s3cret-pass")
    with caplog.at_level(logging.INFO, logger="casebridge"), pytest.raises(EmailSendError) as info:
        send_email(MESSAGE)
    assert str(info.value) == "SMTPServerDisconnected"
    assert "s3cret-pass" not in caplog.text


def test_connection_error_is_an_email_send_error(fake_smtp):
    fake_smtp.fail_with = ConnectionRefusedError()
    with pytest.raises(EmailSendError, match="ConnectionRefusedError"):
        send_email(MESSAGE)


def test_smtp_backend_without_host_fails(fake_smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    with pytest.raises(EmailSendError, match="SMTPHostMissing"):
        send_email(MESSAGE)
    assert fake_smtp.instances == []


def test_header_injection_subject_raises_email_send_error(fake_smtp):
    bad = EmailMessage(to="avukat@demo.casebridge.dev", subject="a\nb", text="x")
    with pytest.raises(EmailSendError) as info:
        send_email(bad)
    assert str(info.value) == "InvalidHeader"
    assert fake_smtp.instances == []


def test_console_backend_log_cannot_be_forged_with_newlines(monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    bad = EmailMessage(to="avukat@demo.casebridge.dev", subject="a\nINFO forged line", text="x")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(bad)
    assert "\n" not in caplog.records[-1].getMessage()
    assert "a\\nINFO forged line" in caplog.text
