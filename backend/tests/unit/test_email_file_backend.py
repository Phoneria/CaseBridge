"""EMAIL_BACKEND=file writes one .eml per message; the console backend shows
the body only for messages that ask for it."""
import logging
import os
import stat
import time
from email import policy
from email.parser import BytesParser

import pytest

from app.core.config import settings
from app.services.email import EmailMessage, EmailSendError, send_email


@pytest.fixture()
def mail_dir(tmp_path, monkeypatch):
    directory = tmp_path / "mail"
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(directory))
    return directory


def _message(to="a@example.com", subject="Konu — test", text="Merhaba https://x.test/sifre-belirle?token=abc"):
    return EmailMessage(to=to, subject=subject, text=text, html="<p>html</p>")


def test_file_backend_writes_one_parseable_eml_per_message(mail_dir):
    send_email(_message())
    time.sleep(0.002)
    send_email(_message(to="b@example.com"))

    files = sorted(mail_dir.glob("*.eml"))
    assert len(files) == 2
    first = BytesParser(policy=policy.default).parsebytes(files[0].read_bytes())
    assert first["To"] == "a@example.com"
    assert first["Subject"] == "Konu — test"
    assert "token=abc" in first.get_body(preferencelist=("plain",)).get_content()
    second = BytesParser(policy=policy.default).parsebytes(files[1].read_bytes())
    assert second["To"] == "b@example.com"


def test_file_backend_creates_the_directory(mail_dir):
    assert not mail_dir.exists()
    send_email(_message())
    assert mail_dir.is_dir()


def test_file_backend_failures_are_content_free_errors(mail_dir, monkeypatch):
    with pytest.raises(EmailSendError) as info:
        send_email(_message(subject="a\nb"))
    assert str(info.value) == "InvalidHeader"

    blocker = mail_dir.parent / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))
    with pytest.raises(EmailSendError) as info:
        send_email(_message())
    assert str(info.value) in {"FileExistsError", "NotADirectoryError"}


def test_file_backend_does_not_log_the_body(mail_dir, caplog):
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(_message(text="GIZLI-GOVDE"))
    assert "a@example.com" in caplog.text
    assert "GIZLI-GOVDE" not in caplog.text


def test_console_backend_logs_the_body_only_when_the_message_asks_for_it(monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(EmailMessage(to="a@example.com", subject="Davet", text="PLAIN-GOVDE"))
        assert "PLAIN-GOVDE" not in caplog.text
        send_email(EmailMessage(to="a@example.com", subject="Davet", text="LINK-GOVDE", show_body_in_dev_console=True))
        assert "LINK-GOVDE" in caplog.text


@pytest.mark.skipif(os.name != "posix", reason="POSIX permissions only")
def test_file_backend_uses_owner_only_permissions(mail_dir):
    send_email(_message())
    assert stat.S_IMODE(mail_dir.stat().st_mode) == 0o700
    (eml,) = mail_dir.glob("*.eml")
    assert stat.S_IMODE(eml.stat().st_mode) == 0o600
