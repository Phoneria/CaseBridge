# Etkileşimli Takvim ve E-posta Hatırlatmaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only month list at `/takvim` into a workspace with month/week/agenda views, filters, an add/edit form and a detail drawer backed by a new `calendar_events` table, and send Turkish e-mail reminders (SMTP or console) a few days before hearings, tasks and events to the responsible person.

**Architecture:** Backend: `app/services/email.py` (stdlib `smtplib`) + `notification_content.py` (Turkish text) + `/notifications` routes; `CalendarEvent` model + `CalendarService` (CRUD, firm checks, `next_hearing_date` sync, unified range list for `GET /calendar`); `ReminderService.collect_due/send_due(now_local)` with a `reminder_deliveries` ledger, driven by `reminder_worker.py` (daemon thread, same start rule as the existing workers). Frontend: `lib/calendar.ts` helpers + `lib/filters.ts` URL state, presentational views in `components/calendar/`, `CalendarView.tsx` orchestrates data, URL, drawer and form; Settings gets a "Bildirimler" section. Docker Compose adds Mailpit.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, pydantic-settings, pytest; Next.js 14, React 18, Tailwind 3.4, Vitest + Testing Library; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-calendar-reminders-design.md`

## Global Constraints

- Branch `feature/calendar-reminders` (already checked out; do not switch). One commit per task. Do not push. Every commit message ends with a blank line, then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`
- No new Python packages (stdlib `smtplib`, `ssl`, `email`, `zoneinfo`). No new npm packages.
- All user-facing copy is Turkish.
- `calendar_events.event_type`: `hearing` | `meeting` | `client_meeting` | `other`; labels: Duruşma, Toplantı, Müvekkil görüşmesi, Diğer (tasks: Görev).
- `title` 1–200 chars; `duration_minutes` default 60, 5–1440; `location` ≤ 200; `starts_at` stored as a naive local time in `APP_TIMEZONE`; `all_day=true` ignores the time.
- `reminder_days`: each value 0–30, no duplicates, sorted largest first. Defaults: hearing `[3, 1]`, other events `[1]`, task `[1]` (task NULL → `[1]`). `[]` = off.
- Reminder recipient: event assignee, else creator; task assignee, else creator; case hearing: the case's assigned lawyer. Users without e-mail or inactive are skipped.
- Due rule (occurrence day `D`, offset `d`): `today == D - d` or `D - d < today < D` (catch-up), and `now_local.hour >= REMINDER_SEND_HOUR`; `D < today` skipped; `d = 0` → the morning of `D`. `sent` never resent; `failed` retried while `attempts < REMINDER_MAX_ATTEMPTS` (3).
- `reminder_deliveries` unique key: (`source_type`, `source_id`, `occurrence_date`, `days_before`, `recipient_user_id`); `source_type` `event` | `task` | `case_hearing`; `status` `sent` | `failed`; `last_error` String(300), no personal data.
- Settings (defaults): `EMAIL_BACKEND` (`console`), `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS` (true), `SMTP_FROM` (`CaseBridge <no-reply@casebridge.local>`), `SMTP_TIMEOUT_SECONDS` (10), `APP_TIMEZONE` (`Europe/Istanbul`), `APP_BASE_URL` (`http://localhost:3000`), `REMINDERS_ENABLED` (true), `REMINDER_SEND_HOUR` (9), `REMINDER_POLL_SECONDS` (900), `REMINDER_MAX_ATTEMPTS` (3). The SMTP password is never logged or returned. `console` logs recipient and subject, never the body.
- E-mail subject: `Hatırlatma: {gün ifadesi} {tür} – {başlık}` with `bugün` / `yarın` / `{d} gün sonra`; body: type, title, date `gg.aa.yyyy`, time (if not all-day), location, case; links `{APP_BASE_URL}/davalar/{case_id}` and `{APP_BASE_URL}/takvim?ay=YYYY-MM`; footer `Bu e-posta CaseBridge tarafından otomatik gönderildi.`
- `POST /notifications/test-email` → 200 `{sent: true, backend}`; SMTP error → 502 `E-posta gönderilemedi. SMTP ayarlarını kontrol edin.`
- `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (default today −31 / +62 days). Item ids `event:<id>`, `task:<id>`, `hearing:<case_id>`. Legacy fields `date`, `title`, `case_id`, `case_name`, `task_id` (and `event_type` `hearing`/`task`) keep their meaning; existing users of `CalendarEvent` keep working.
- A hearing event on a case, on/after today, sets the case's `next_hearing_date` when it is empty or later. A case hearing is hidden in the calendar when a hearing event of the same case exists the same day.
- Time handling is testable: `ReminderService` takes `now_local`; only the worker computes it (from `APP_TIMEZONE`).
- The reminder worker never starts during tests (`settings.env == "test"`, same as the existing workers) or when `REMINDERS_ENABLED=false`.
- Frontend URL: `?gorunum=ay|hafta|ajanda` (default `ay`), `?hafta=YYYY-MM-DD` (Monday), filters `tur=`, `sorumlu=`, `dava=`, `benim=1`; legacy `goster=` is still read. Week grid 08:00–20:00. Agenda: today + 30 days. Reminder choices: Aynı gün, 1, 3, 7 gün önce, "Hatırlatma yok".
- `docker-compose.yml` change is additive only (mailpit service + four backend env lines) so it merges with local port-parametrization edits. Tailwind `navy` has only 500–950 shades.

**Environment:** backend `cd backend && source .venv/bin/activate` (full `pytest -q` ≈ 3 min); frontend from `frontend/`: `npx vitest run`, `npx tsc --noEmit`; E2E from `tests/e2e/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Alembic head before this plan: `d7a3c9e1b5f2`.

## File Map

Backend (`backend/`):
- `app/core/config.py` (modify, T1) — e-mail and reminder settings, `APP_TIMEZONE` validation.
- `app/services/email.py` (new, T1) — `EmailMessage`, `EmailSendError`, `send_email`.
- `app/services/notification_content.py` (new T1, extended T4) — test e-mail, `day_phrase`, `build_reminder_email`.
- `app/schemas/notification.py`, `app/api/routes/notifications.py` (new, T1) — `GET /notifications/status`, `POST /notifications/test-email`.
- `app/core/timeutil.py` (new, T2) — `local_now`, `local_today`, `to_local_naive`.
- `app/domain/calendar.py` (new, T2) — reminder defaults/limits, Turkish type labels.
- `app/models/calendar.py` (new T2, extended T4) — `CalendarEvent`, `ReminderDelivery` + enums.
- `app/models/task.py`, `app/schemas/task.py`, `app/api/routes/tasks.py` (modify, T2) — `reminder_days`, `PATCH /tasks/{id}`.
- `alembic/versions/e2a4c6b8d0f1_add_calendar_events.py` (T2), `f3b5d7e9a1c2_add_reminder_deliveries.py` (T4).
- `app/schemas/calendar.py`, `app/services/calendar_service.py`, `app/api/routes/calendar.py` (T2, T3) — event CRUD, unified list.
- `app/services/reminder_service.py` (new, T4), `app/services/reminder_worker.py` (new, T5), `app/main.py` (T1, T5), `Dockerfile` (T5).

Root: `docker-compose.yml`, `.env.example` (T5); `tests/e2e/specs/08-calendar.spec.ts` (T11).

Frontend (`frontend/src/`):
- `types/index.ts`, `lib/api.ts`, `lib/filters.ts`, `lib/calendar.ts` (T6).
- `components/calendar/CalendarItemButton.tsx`, `CalendarMonthView.tsx`, `CalendarWeekView.tsx`, `CalendarAgendaView.tsx`, `CalendarFilters.tsx` (T7).
- `components/calendar/ReminderPicker.tsx`, `CalendarEventForm.tsx`, `CalendarEventDrawer.tsx` (T8).
- `components/CalendarView.tsx` (T6 minimal, T9 rewrite), `components/SettingsView.tsx` (T10).

---

### Task 1: E-mail layer, settings and notification endpoints

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/main.py`
- Create: `backend/app/services/email.py`, `backend/app/services/notification_content.py`, `backend/app/schemas/notification.py`, `backend/app/api/routes/notifications.py`
- Test: `backend/tests/unit/test_email.py` (new), `backend/tests/api/test_notifications.py` (new), `backend/tests/unit/test_config.py`

**Interfaces:**
- Produces:
  - `settings.email_backend: Literal["console","smtp"]`, `smtp_host: str`, `smtp_port: int`, `smtp_username: str`, `smtp_password: str`, `smtp_use_tls: bool`, `smtp_from: str`, `smtp_timeout_seconds: float`, `app_timezone: str`, `app_base_url: str`, `reminders_enabled: bool`, `reminder_send_hour: int (0-23)`, `reminder_poll_seconds: int`, `reminder_max_attempts: int`.
  - `app.services.email`: `EmailMessage(to: str, subject: str, text: str, html: Optional[str] = None)` (frozen dataclass), `class EmailSendError(Exception)` (`str(exc)` = exception type name), `send_email(message: EmailMessage) -> None`.
  - `app.services.notification_content`: `FOOTER`, `TEST_EMAIL_SUBJECT`, `build_test_email(user: User) -> EmailMessage`.
  - `GET /notifications/status` → `{email_backend, reminders_enabled, reminder_send_hour, timezone}`; `POST /notifications/test-email` → `{sent: true, backend}` / 502.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_email.py`:

```python
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
```

Create `backend/tests/api/test_notifications.py`:

```python
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
```

Append to `backend/tests/unit/test_config.py` (it already imports `pytest`):

```python
def test_email_and_reminder_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    for name in (
        "EMAIL_BACKEND", "SMTP_HOST", "SMTP_PORT", "SMTP_USE_TLS", "SMTP_FROM", "SMTP_TIMEOUT_SECONDS",
        "APP_TIMEZONE", "APP_BASE_URL", "REMINDERS_ENABLED", "REMINDER_SEND_HOUR",
        "REMINDER_POLL_SECONDS", "REMINDER_MAX_ATTEMPTS",
    ):
        monkeypatch.delenv(name, raising=False)

    from app.core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.email_backend == "console"
    assert (settings.smtp_host, settings.smtp_port, settings.smtp_use_tls) == ("", 587, True)
    assert settings.smtp_from == "CaseBridge <no-reply@casebridge.local>"
    assert settings.smtp_timeout_seconds == 10
    assert settings.app_timezone == "Europe/Istanbul"
    assert settings.app_base_url == "http://localhost:3000"
    assert settings.reminders_enabled is True
    assert (settings.reminder_send_hour, settings.reminder_poll_seconds, settings.reminder_max_attempts) == (9, 900, 3)


@pytest.mark.parametrize(
    "name,value",
    [("APP_TIMEZONE", "Mars/Olympus"), ("REMINDER_SEND_HOUR", "24"), ("REMINDER_POLL_SECONDS", "0"), ("EMAIL_BACKEND", "pigeon")],
)
def test_invalid_email_and_reminder_settings_fail(monkeypatch, name, value):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv(name, value)

    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_email.py tests/api/test_notifications.py tests/unit/test_config.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.email'`; config tests fail with `AttributeError: 'Settings' object has no attribute 'email_backend'`.

- [ ] **Step 3: Implement**

Apply to `backend/app/core/config.py`:

```diff
diff --git a/backend/app/core/config.py b/backend/app/core/config.py
--- a/backend/app/core/config.py
+++ b/backend/app/core/config.py
@@ -5,8 +5,9 @@ casebridge/.env.example). Nothing here should ever be hardcoded, and
 this module must never log secret values.
 """
 from typing import Literal, Optional
+from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
 
-from pydantic import PositiveFloat, PositiveInt, field_validator
+from pydantic import Field, PositiveFloat, PositiveInt, field_validator
 from pydantic_settings import BaseSettings, SettingsConfigDict
 
 
@@ -82,6 +83,27 @@ class Settings(BaseSettings):
     chat_auto_level: bool = True
     chat_classifier_timeout_seconds: PositiveFloat = 8
 
+    # Outgoing e-mail (calendar reminders, test e-mail). "console" only logs
+    # the recipient and subject; "smtp" sends with the stdlib smtplib.
+    # SMTP_PASSWORD is never logged or returned by any endpoint.
+    email_backend: Literal["console", "smtp"] = "console"
+    smtp_host: str = ""
+    smtp_port: PositiveInt = 587
+    smtp_username: str = ""
+    smtp_password: str = ""
+    smtp_use_tls: bool = True
+    smtp_from: str = "CaseBridge <no-reply@casebridge.local>"
+    smtp_timeout_seconds: PositiveFloat = 10
+
+    # Calendar and reminders. Event times are stored as naive local times
+    # in APP_TIMEZONE; the reminder worker computes "now" in this zone.
+    app_timezone: str = "Europe/Istanbul"
+    app_base_url: str = "http://localhost:3000"
+    reminders_enabled: bool = True
+    reminder_send_hour: int = Field(default=9, ge=0, le=23)
+    reminder_poll_seconds: PositiveInt = 900
+    reminder_max_attempts: PositiveInt = 3
+
     storage_dir: str = "storage"
     max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
 
@@ -103,6 +125,15 @@ class Settings(BaseSettings):
             raise ValueError("JWT_SECRET must be set and non-empty")
         return value
 
+    @field_validator("app_timezone")
+    @classmethod
+    def app_timezone_must_exist(cls, value: str) -> str:
+        try:
+            ZoneInfo(value)
+        except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
+            raise ValueError(f"APP_TIMEZONE is not a known time zone: {value}") from exc
+        return value
+
     @property
     def ai_enabled(self) -> bool:
         return self.llm_provider != "mock"
```

Create `backend/app/services/email.py`:

```python
"""Outgoing e-mail.

EMAIL_BACKEND=console only logs the recipient and subject (never the
body); EMAIL_BACKEND=smtp sends with the stdlib smtplib (STARTTLS when
SMTP_USE_TLS, login when SMTP_USERNAME is set). SMTP_PASSWORD is never
logged. Failures raise EmailSendError whose message is only the
exception type name, so it is safe to store and log.
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("casebridge")


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: Optional[str] = None


class EmailSendError(Exception):
    """Sending failed. str(exc) is a short, content-free error code."""


def _build_mime(message: EmailMessage) -> MimeMessage:
    mime = MimeMessage()
    mime["From"] = settings.smtp_from
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime.set_content(message.text)
    if message.html:
        mime.add_alternative(message.html, subtype="html")
    return mime


def send_email(message: EmailMessage) -> None:
    if settings.email_backend == "console":
        logger.info("E-posta (console): alıcı=%s konu=%s", message.to, message.subject)
        return
    if not settings.smtp_host:
        raise EmailSendError("SMTPHostMissing")

    mime = _build_mime(message)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(mime)
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("E-posta gönderilemedi: %s", type(exc).__name__)
        raise EmailSendError(type(exc).__name__) from exc
```

Create `backend/app/services/notification_content.py` (Task 4 extends it):

```python
"""Turkish e-mail content for notifications (test e-mail, reminders)."""
from html import escape

from app.models.user import User
from app.services.email import EmailMessage

FOOTER = "Bu e-posta CaseBridge tarafından otomatik gönderildi."
TEST_EMAIL_SUBJECT = "CaseBridge test e-postası"


def build_test_email(user: User) -> EmailMessage:
    text = (
        f"Merhaba {user.full_name},\n\n"
        "Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.\n\n"
        f"{FOOTER}\n"
    )
    html = (
        f"<p>Merhaba {escape(user.full_name)},</p>"
        "<p>Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.</p>"
        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(to=user.email, subject=TEST_EMAIL_SUBJECT, text=text, html=html)
```

Create `backend/app/schemas/notification.py`:

```python
"""Schemas for e-mail notification endpoints."""
from typing import Literal

from pydantic import BaseModel


class NotificationStatusOut(BaseModel):
    email_backend: Literal["console", "smtp"]
    reminders_enabled: bool
    reminder_send_hour: int
    timezone: str


class EmailTestOut(BaseModel):
    sent: bool
    backend: Literal["console", "smtp"]
```

(The response model is named `EmailTestOut`, not `Test…`, so pytest never tries to collect it.)

Create `backend/app/api/routes/notifications.py`:

```python
"""E-mail notification endpoints: delivery status (no secrets) and a test
e-mail to the signed-in user."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.notification import NotificationStatusOut, EmailTestOut
from app.services.email import EmailSendError, send_email
from app.services.notification_content import build_test_email

router = APIRouter(prefix="/notifications", tags=["notifications"])

SEND_FAILED_DETAIL = "E-posta gönderilemedi. SMTP ayarlarını kontrol edin."


@router.get("/status", response_model=NotificationStatusOut)
def notification_status(current_user: User = Depends(get_current_user)):
    return NotificationStatusOut(
        email_backend=settings.email_backend,
        reminders_enabled=settings.reminders_enabled,
        reminder_send_hour=settings.reminder_send_hour,
        timezone=settings.app_timezone,
    )


@router.post("/test-email", response_model=EmailTestOut)
def send_test_email(current_user: User = Depends(get_current_user)):
    try:
        send_email(build_test_email(current_user))
    except EmailSendError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=SEND_FAILED_DETAIL)
    return EmailTestOut(sent=True, backend=settings.email_backend)
```

In `backend/app/main.py` add `notifications` to the routes import (alphabetical, after `health`) and register the router after the chat router:

```python
from app.api.routes import activity, analytics, auth, calendar, cases, chat, courtroom, documents, handover, health, notifications, reports, simulations, system, tasks, users
...
app.include_router(chat.router)
app.include_router(notifications.router)
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_email.py tests/api/test_notifications.py tests/unit/test_config.py -q`
Expected: 30 passed.

- [ ] **Step: Commit**

```bash
git add backend/app/core/config.py backend/app/main.py backend/app/services/email.py backend/app/services/notification_content.py backend/app/schemas/notification.py backend/app/api/routes/notifications.py backend/tests/unit/test_email.py backend/tests/api/test_notifications.py backend/tests/unit/test_config.py
git commit -F - <<'EOF'
feat(notifications): SMTP/console e-mail layer, reminder settings and test e-mail endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 2: Calendar events — model, migration, CRUD API, task `reminder_days`, hearing sync

**Files:**
- Create: `backend/app/core/timeutil.py`, `backend/app/domain/calendar.py`, `backend/app/models/calendar.py`, `backend/alembic/versions/e2a4c6b8d0f1_add_calendar_events.py`, `backend/app/services/calendar_service.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/models/task.py`, `backend/app/schemas/calendar.py`, `backend/app/schemas/task.py`, `backend/app/api/routes/calendar.py`, `backend/app/api/routes/tasks.py`
- Test: `backend/tests/api/test_calendar_events.py` (new), `backend/tests/integration/test_calendar_migration.py` (new), `backend/tests/api/test_tasks.py`

**Interfaces:**
- Consumes: `settings.app_timezone` (Task 1).
- Produces:
  - `app.core.timeutil`: `app_zone() -> ZoneInfo`, `local_now() -> datetime` (naive), `local_today() -> date`, `to_local_naive(value: datetime) -> datetime`.
  - `app.domain.calendar`: `MAX_REMINDER_DAYS = 30`, `HEARING_REMINDER_DAYS = [3, 1]`, `EVENT_REMINDER_DAYS = [1]`, `TASK_REMINDER_DAYS = [1]`, `TYPE_LABELS: dict[str, str]` (keys `hearing|meeting|client_meeting|other|task`), `normalize_reminder_days(values) -> list[int]`, `default_event_reminder_days(event_type: str) -> list[int]`, `task_reminder_days(stored: Optional[list[int]]) -> list[int]`.
  - `app.models.calendar`: `CalendarEventType` (str enum), `CalendarEvent` (table `calendar_events`).
  - `Task.reminder_days: Optional[list[int]]` (JSON); `TaskUpdate.reminder_days`, `TaskOut.reminder_days`; `PATCH /tasks/{task_id}`.
  - `app.schemas.calendar`: `ReminderDays` (annotated type), `CalendarItemOut` (legacy list row, renamed from `CalendarEventOut`; Task 3 replaces its fields), `CalendarEventCreate`, `CalendarEventUpdate`, `CalendarEventOut`.
  - `app.services.calendar_service`: `CalendarReferenceNotFound(detail)`, `CalendarService(db)` with `create_event(law_firm_id, created_by, payload, today) -> CalendarEvent`, `get_event(event_id, law_firm_id)`, `update_event(event, payload, today)`, `delete_event(event)`.
  - Routes: `POST /calendar/events` (201), `GET|PATCH|DELETE /calendar/events/{id}` (404 `Etkinlik bulunamadı`; foreign case → 404 `Dava bulunamadı`, foreign assignee → 404 `Kullanıcı bulunamadı`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_calendar_events.py`:

```python
"""Calendar events API: CRUD, firm isolation, case/assignee validation,
reminder_days rules and the hearing -> next_hearing_date sync."""
import pytest

CASE_PAYLOAD = {
    "case_number": "2026/901",
    "case_name": "Ticari Kira Uyarlama Davası",
    "client_name": "Deniz Arslan",
    "case_type": "kira",
    "status": "devam_eden",
}


def _auth_headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_case(client, headers, **overrides):
    response = client.post("/cases", json={**CASE_PAYLOAD, **overrides}, headers=headers)
    assert response.status_code == 201
    return response.json()


def _create_event(client, headers, **overrides):
    payload = {"title": "Müvekkil toplantısı", "event_type": "meeting", "starts_at": "2099-03-10T14:30:00", **overrides}
    return client.post("/calendar/events", json=payload, headers=headers)


def test_create_event_returns_201_with_defaults(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)

    response = _create_event(client, headers)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Müvekkil toplantısı"
    assert body["event_type"] == "meeting"
    assert body["starts_at"] == "2099-03-10T14:30:00"
    assert body["all_day"] is False
    assert body["duration_minutes"] == 60
    assert body["reminder_days"] == [1]
    assert body["created_by"] == fixtures["user_a"].id
    assert body["case_id"] is None and body["assignee_id"] is None


def test_hearing_events_default_to_three_and_one_day_reminders(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = _create_event(client, headers, title="Duruşma", event_type="hearing")
    assert response.json()["reminder_days"] == [3, 1]


def test_reminder_days_are_deduplicated_and_sorted_and_can_be_empty(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    assert _create_event(client, headers, reminder_days=[1, 7, 0, 1]).json()["reminder_days"] == [7, 1, 0]
    assert _create_event(client, headers, reminder_days=[]).json()["reminder_days"] == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"reminder_days": [31]},
        {"reminder_days": [-1]},
        {"title": "   "},
        {"title": "x" * 201},
        {"duration_minutes": 4},
        {"duration_minutes": 1441},
        {"event_type": "party"},
        {"location": "x" * 201},
    ],
)
def test_invalid_event_payloads_are_rejected(client, two_firms_two_users, overrides):
    headers = _auth_headers(client, two_firms_two_users)
    assert _create_event(client, headers, **overrides).status_code == 422


def test_all_day_events_are_stored_at_midnight(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    body = _create_event(client, headers, all_day=True, starts_at="2099-03-10T14:30:00").json()
    assert body["starts_at"] == "2099-03-10T00:00:00"


def test_aware_start_times_are_converted_to_app_timezone(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    body = _create_event(client, headers, starts_at="2099-03-10T07:30:00Z").json()
    assert body["starts_at"] == "2099-03-10T10:30:00"  # Europe/Istanbul is UTC+3


def test_event_can_link_a_case_and_an_assignee_of_the_same_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures)
    case = _create_case(client, headers)

    body = _create_event(client, headers, case_id=case["id"], assignee_id=fixtures["user_a"].id).json()

    assert body["case_id"] == case["id"]
    assert body["assignee_id"] == fixtures["user_a"].id


def test_case_or_assignee_from_another_firm_is_404(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    other_case = _create_case(client, headers_b)

    by_case = _create_event(client, headers_a, case_id=other_case["id"])
    by_user = _create_event(client, headers_a, assignee_id=fixtures["user_b"].id)

    assert (by_case.status_code, by_case.json()["detail"]) == (404, "Dava bulunamadı")
    assert (by_user.status_code, by_user.json()["detail"]) == (404, "Kullanıcı bulunamadı")


def test_get_patch_and_delete_an_event(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    event = _create_event(client, headers).json()

    assert client.get(f"/calendar/events/{event['id']}", headers=headers).json()["title"] == "Müvekkil toplantısı"

    patched = client.patch(
        f"/calendar/events/{event['id']}",
        json={"title": "Bilirkişi görüşmesi", "reminder_days": [3], "location": "Büro"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Bilirkişi görüşmesi"
    assert patched.json()["reminder_days"] == [3]
    assert patched.json()["location"] == "Büro"
    assert patched.json()["starts_at"] == "2099-03-10T14:30:00"

    assert client.delete(f"/calendar/events/{event['id']}", headers=headers).status_code == 204
    assert client.get(f"/calendar/events/{event['id']}", headers=headers).status_code == 404


def test_patch_rejects_null_for_required_fields_and_foreign_case(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    event = _create_event(client, headers_a).json()
    other_case = _create_case(client, headers_b)

    assert client.patch(f"/calendar/events/{event['id']}", json={"title": None}, headers=headers_a).status_code == 422
    assert client.patch(f"/calendar/events/{event['id']}", json={"reminder_days": None}, headers=headers_a).status_code == 422
    response = client.patch(f"/calendar/events/{event['id']}", json={"case_id": other_case["id"]}, headers=headers_a)
    assert response.status_code == 404


def test_events_are_isolated_by_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    event = _create_event(client, headers_a).json()

    assert client.get(f"/calendar/events/{event['id']}", headers=headers_b).status_code == 404
    assert client.patch(f"/calendar/events/{event['id']}", json={"title": "X"}, headers=headers_b).status_code == 404
    assert client.delete(f"/calendar/events/{event['id']}", headers=headers_b).status_code == 404
    assert client.get(f"/calendar/events/{event['id']}", headers=headers_a).status_code == 200


def test_event_endpoints_require_login(client):
    assert client.post("/calendar/events", json={}).status_code == 401
    assert client.get("/calendar/events/x").status_code == 401


# ----- hearing events keep the case's next_hearing_date in sync -----


def _hearing(client, headers, case_id, starts_at):
    response = _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case_id, starts_at=starts_at)
    assert response.status_code == 201
    return response.json()


def _next_hearing(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["next_hearing_date"]


def test_hearing_event_sets_an_empty_next_hearing_date(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
    assert _next_hearing(client, headers, case["id"]) == "2099-05-10"


def test_hearing_event_moves_a_later_next_hearing_date_earlier_only(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    later = _create_case(client, headers, case_number="2026/902", next_hearing_date="2099-06-01")
    earlier = _create_case(client, headers, case_number="2026/903", next_hearing_date="2099-05-01")

    _hearing(client, headers, later["id"], "2099-05-10T10:00:00")
    _hearing(client, headers, earlier["id"], "2099-05-10T10:00:00")

    assert _next_hearing(client, headers, later["id"]) == "2099-05-10"
    assert _next_hearing(client, headers, earlier["id"]) == "2099-05-01"


def test_past_hearings_and_other_event_types_do_not_touch_the_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    _hearing(client, headers, case["id"], "2000-01-10T10:00:00")
    _create_event(client, headers, case_id=case["id"], event_type="meeting", starts_at="2099-05-10T10:00:00")
    assert _next_hearing(client, headers, case["id"]) is None


def test_moving_a_hearing_event_earlier_updates_the_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")

    client.patch(f"/calendar/events/{event['id']}", json={"starts_at": "2099-04-20T09:00:00"}, headers=headers)

    assert _next_hearing(client, headers, case["id"]) == "2099-04-20"
```

Create `backend/tests/integration/test_calendar_migration.py` (Task 4 appends a second test):

```python
"""The Alembic chain creates the calendar tables (and drops them again)."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    # No ini file: env.py then skips fileConfig, so test logging stays intact.
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def test_migration_adds_calendar_events_and_task_reminder_days(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, "e2a4c6b8d0f1")
    inspector = sa.inspect(sa.create_engine(url))
    assert "calendar_events" in inspector.get_table_names()
    assert "reminder_days" in {column["name"] for column in inspector.get_columns("tasks")}

    command.downgrade(config, "d7a3c9e1b5f2")
    inspector = sa.inspect(sa.create_engine(url))
    assert "calendar_events" not in inspector.get_table_names()
    assert "reminder_days" not in {column["name"] for column in inspector.get_columns("tasks")}
```

Append to `backend/tests/api/test_tasks.py`:

```python
def test_firm_wide_task_patch_sets_and_resets_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()
    assert task["reminder_days"] is None

    response = client.patch(f"/tasks/{task['id']}", json={"reminder_days": [0, 7, 7]}, headers=headers)
    assert response.status_code == 200
    assert response.json()["reminder_days"] == [7, 0]
    assert response.json()["title"] == "Gorev"

    reset = client.patch(f"/tasks/{task['id']}", json={"reminder_days": None}, headers=headers)
    assert reset.json()["reminder_days"] is None

    assert client.patch(f"/tasks/{task['id']}", json={"reminder_days": [40]}, headers=headers).status_code == 422


def test_case_scoped_task_patch_accepts_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()

    response = client.patch(f"/cases/{case['id']}/tasks/{task['id']}", json={"reminder_days": []}, headers=headers)

    assert response.json()["reminder_days"] == []


def test_firm_wide_task_patch_is_isolated_by_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers_a).json()

    response = client.patch(f"/tasks/{task['id']}", json={"status": "completed"}, headers=headers_b)

    assert response.status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/api/test_calendar_events.py tests/api/test_tasks.py tests/integration/test_calendar_migration.py -q`
Expected: FAIL — `/calendar/events` returns 405/404, `reminder_days` missing from task responses (`KeyError: 'reminder_days'`), alembic `Can't locate revision identified by 'e2a4c6b8d0f1'`.

- [ ] **Step 3: Implement**

Create `backend/app/core/timeutil.py`:

```python
"""Application-local time (APP_TIMEZONE).

Calendar event times are stored as naive datetimes in this zone, and
"today" for the calendar and reminders is the date in this zone.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def app_zone() -> ZoneInfo:
    return ZoneInfo(settings.app_timezone)


def local_now() -> datetime:
    """Current wall-clock time in APP_TIMEZONE, as a naive datetime."""
    return datetime.now(app_zone()).replace(tzinfo=None)


def local_today() -> date:
    return local_now().date()


def to_local_naive(value: datetime) -> datetime:
    """Aware datetimes are converted to APP_TIMEZONE; naive ones are
    already local and returned unchanged."""
    if value.tzinfo is None:
        return value
    return value.astimezone(app_zone()).replace(tzinfo=None)
```

Create `backend/app/domain/calendar.py`:

```python
"""Calendar rules shared by the API and the reminder service: reminder
defaults, the allowed reminder range and Turkish type labels."""
from typing import Optional

MAX_REMINDER_DAYS = 30
HEARING_REMINDER_DAYS = [3, 1]
EVENT_REMINDER_DAYS = [1]
TASK_REMINDER_DAYS = [1]

TYPE_LABELS = {
    "hearing": "Duruşma",
    "meeting": "Toplantı",
    "client_meeting": "Müvekkil görüşmesi",
    "other": "Diğer",
    "task": "Görev",
}


def normalize_reminder_days(values: list[int]) -> list[int]:
    """Each value 0-30; duplicates removed; largest first."""
    for value in values:
        if value < 0 or value > MAX_REMINDER_DAYS:
            raise ValueError("Hatırlatma günleri 0 ile 30 arasında olmalıdır.")
    return sorted(set(values), reverse=True)


def default_event_reminder_days(event_type: str) -> list[int]:
    return list(HEARING_REMINDER_DAYS if event_type == "hearing" else EVENT_REMINDER_DAYS)


def task_reminder_days(stored: Optional[list[int]]) -> list[int]:
    """A task without its own choice (NULL) uses the default [1]."""
    return list(TASK_REMINDER_DAYS) if stored is None else list(stored)
```

Create `backend/app/models/calendar.py`:

```python
import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import str_enum


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CalendarEventType(str, enum.Enum):
    HEARING = "hearing"
    MEETING = "meeting"
    CLIENT_MEETING = "client_meeting"
    OTHER = "other"


class CalendarEvent(Base):
    """A user-created calendar entry. starts_at is a naive local time in
    APP_TIMEZONE; for all-day events it is midnight and only the date counts."""

    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[CalendarEventType] = mapped_column(str_enum(CalendarEventType), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    case_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True, index=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reminder_days: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)
```

Append to `backend/app/models/__init__.py`:

```python
from app.models.calendar import CalendarEvent, CalendarEventType  # noqa: F401
```

Apply to `backend/app/models/task.py`:

```diff
diff --git a/backend/app/models/task.py b/backend/app/models/task.py
--- a/backend/app/models/task.py
+++ b/backend/app/models/task.py
@@ -1,8 +1,9 @@
 import enum
 import uuid
 from datetime import date, datetime, timezone
+from typing import Optional
 
-from sqlalchemy import Date, DateTime, ForeignKey, String, Text
+from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Text
 from sqlalchemy.orm import Mapped, mapped_column
 
 from app.db.base import Base
@@ -28,6 +29,8 @@ class Task(Base):
 
     assigned_to: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
     created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
+    #: Days before due_date to send an e-mail reminder; NULL -> default [1], [] -> none.
+    reminder_days: Mapped[Optional[list[int]]] = mapped_column(JSON, nullable=True)
 
     created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
     completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
```

Create `backend/alembic/versions/e2a4c6b8d0f1_add_calendar_events.py`:

```python
"""add calendar events and task reminder days

Revision ID: e2a4c6b8d0f1
Revises: d7a3c9e1b5f2
Create Date: 2026-10-02 18:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2a4c6b8d0f1"
down_revision: Union[str, Sequence[str], None] = "d7a3c9e1b5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum("hearing", "meeting", "client_meeting", "other", name="calendareventtype"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("assignee_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reminder_days", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_calendar_events_law_firm_id", "calendar_events", ["law_firm_id"])
    op.create_index("ix_calendar_events_starts_at", "calendar_events", ["starts_at"])
    op.create_index("ix_calendar_events_case_id", "calendar_events", ["case_id"])

    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("reminder_days", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("reminder_days")
    op.drop_index("ix_calendar_events_case_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_starts_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_law_firm_id", table_name="calendar_events")
    op.drop_table("calendar_events")
    sa.Enum(name="calendareventtype").drop(op.get_bind(), checkfirst=True)
```

Replace `backend/app/schemas/calendar.py` with:

```python
"""Schemas for the firm-wide calendar: list items and calendar events."""
from datetime import date, datetime
from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.domain.calendar import normalize_reminder_days
from app.models.calendar import CalendarEventType

#: 0-30 each, duplicates removed, largest first.
ReminderDays = Annotated[list[int], AfterValidator(normalize_reminder_days)]
EventTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DurationMinutes = Annotated[int, Field(ge=5, le=1440)]
ShortText = Annotated[str, StringConstraints(max_length=200)]
NotesText = Annotated[str, StringConstraints(max_length=5000)]


class CalendarItemOut(BaseModel):
    event_type: Literal["hearing", "task"]
    date: date
    title: str
    case_id: str
    case_name: str
    task_id: Optional[str] = None


class CalendarEventCreate(BaseModel):
    title: EventTitle
    event_type: CalendarEventType = CalendarEventType.OTHER
    starts_at: datetime
    all_day: bool = False
    duration_minutes: DurationMinutes = 60
    location: Optional[ShortText] = None
    notes: Optional[NotesText] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    #: Omitted -> default for the type (hearing [3, 1], others [1]); [] -> no reminders.
    reminder_days: Optional[ReminderDays] = None


_REQUIRED_ON_UPDATE = ("title", "event_type", "starts_at", "all_day", "duration_minutes", "reminder_days")


class CalendarEventUpdate(BaseModel):
    title: Optional[EventTitle] = None
    event_type: Optional[CalendarEventType] = None
    starts_at: Optional[datetime] = None
    all_day: Optional[bool] = None
    duration_minutes: Optional[DurationMinutes] = None
    location: Optional[ShortText] = None
    notes: Optional[NotesText] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    reminder_days: Optional[ReminderDays] = None

    @model_validator(mode="after")
    def required_fields_are_not_null(self):
        for field in _REQUIRED_ON_UPDATE:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} boş olamaz.")
        return self


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    event_type: CalendarEventType
    starts_at: datetime
    all_day: bool
    duration_minutes: int
    location: Optional[str] = None
    notes: Optional[str] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    created_by: str
    reminder_days: list[int]
    created_at: datetime
    updated_at: datetime
```

Apply to `backend/app/schemas/task.py`:

```diff
diff --git a/backend/app/schemas/task.py b/backend/app/schemas/task.py
--- a/backend/app/schemas/task.py
+++ b/backend/app/schemas/task.py
@@ -4,6 +4,7 @@ from typing import Optional
 from pydantic import BaseModel, ConfigDict
 
 from app.models.task import TaskStatus
+from app.schemas.calendar import ReminderDays
 
 
 class TaskCreate(BaseModel):
@@ -19,6 +20,8 @@ class TaskUpdate(BaseModel):
     due_date: Optional[date] = None
     assigned_to: Optional[str] = None
     status: Optional[TaskStatus] = None
+    #: null -> default [1]; [] -> no reminders.
+    reminder_days: Optional[ReminderDays] = None
 
 
 class TaskOut(BaseModel):
@@ -33,6 +36,7 @@ class TaskOut(BaseModel):
     assigned_to: Optional[str] = None
     created_at: datetime
     completed_at: Optional[datetime] = None
+    reminder_days: Optional[list[int]] = None
 
 
 class TaskWithCaseOut(TaskOut):
```

Create `backend/app/services/calendar_service.py`:

```python
"""Calendar events (CRUD) and the firm-wide calendar list.

Every query is scoped by law_firm_id. A referenced case or assignee from
another firm is reported as "not found" (404), never as "forbidden".
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.timeutil import to_local_naive
from app.domain.calendar import default_event_reminder_days
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case
from app.repositories.user_repository import UserRepository
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate


class CalendarReferenceNotFound(Exception):
    """A referenced case or user is not in the caller's firm."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class CalendarService:
    def __init__(self, db: Session):
        self.db = db

    # ----- events -----

    def create_event(
        self, law_firm_id: str, created_by: str, payload: CalendarEventCreate, today: date
    ) -> CalendarEvent:
        case = self._check_references(law_firm_id, payload.case_id, payload.assignee_id)
        reminder_days = (
            payload.reminder_days
            if payload.reminder_days is not None
            else default_event_reminder_days(payload.event_type)
        )
        event = CalendarEvent(
            law_firm_id=law_firm_id,
            title=payload.title,
            event_type=payload.event_type,
            starts_at=_normalize_start(payload.starts_at, payload.all_day),
            all_day=payload.all_day,
            duration_minutes=payload.duration_minutes,
            location=payload.location,
            notes=payload.notes,
            case_id=payload.case_id,
            assignee_id=payload.assignee_id,
            created_by=created_by,
            reminder_days=reminder_days,
        )
        self.db.add(event)
        _sync_next_hearing(event, case, today)
        self.db.commit()
        self.db.refresh(event)
        return event

    def get_event(self, event_id: str, law_firm_id: str) -> Optional[CalendarEvent]:
        return (
            self.db.query(CalendarEvent)
            .filter(CalendarEvent.id == event_id, CalendarEvent.law_firm_id == law_firm_id)
            .first()
        )

    def update_event(self, event: CalendarEvent, payload: CalendarEventUpdate, today: date) -> CalendarEvent:
        updates = payload.model_dump(exclude_unset=True)
        self._check_references(event.law_firm_id, updates.get("case_id"), updates.get("assignee_id"))
        for field, value in updates.items():
            setattr(event, field, value)
        event.starts_at = _normalize_start(event.starts_at, event.all_day)
        case = self._case_in_firm(event.case_id, event.law_firm_id) if event.case_id else None
        _sync_next_hearing(event, case, today)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete_event(self, event: CalendarEvent) -> None:
        self.db.delete(event)
        self.db.commit()

    # ----- helpers -----

    def _case_in_firm(self, case_id: str, law_firm_id: str) -> Optional[Case]:
        return self.db.query(Case).filter(Case.id == case_id, Case.law_firm_id == law_firm_id).first()

    def _check_references(
        self, law_firm_id: str, case_id: Optional[str], assignee_id: Optional[str]
    ) -> Optional[Case]:
        case = None
        if case_id is not None:
            case = self._case_in_firm(case_id, law_firm_id)
            if case is None:
                raise CalendarReferenceNotFound("Dava bulunamadı")
        if assignee_id is not None and UserRepository(self.db).get_by_id_in_firm(assignee_id, law_firm_id) is None:
            raise CalendarReferenceNotFound("Kullanıcı bulunamadı")
        return case


def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
    local = to_local_naive(starts_at).replace(second=0, microsecond=0)
    if all_day:
        local = local.replace(hour=0, minute=0)
    return local


def _sync_next_hearing(event: CalendarEvent, case: Optional[Case], today: date) -> None:
    """A hearing event on or after today pulls the case's next_hearing_date
    earlier (or sets it when empty); it never pushes it later."""
    if case is None or event.event_type != CalendarEventType.HEARING:
        return
    day = event.starts_at.date()
    if day < today:
        return
    if case.next_hearing_date is None or case.next_hearing_date > day:
        case.next_hearing_date = day
```

Replace `backend/app/api/routes/calendar.py` with (the list endpoint is unchanged apart from the schema rename; Task 3 rewrites it):

```python
"""Firm-wide calendar (Phase 4 - Takvim): merges case hearing dates
and task due dates into one chronological list. Replaces the
ComingSoon placeholder on app/takvim/page.tsx.

Not a new DB table - reads from Case.next_hearing_date and
Task.due_date, both already tenant-scoped, and sorts the union in
Python since the two source queries are cheap and small at MVP scale.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.case import Case
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarItemOut
from app.services.calendar_service import CalendarReferenceNotFound, CalendarService

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=list[CalendarItemOut])
def list_calendar_events(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    events: list[CalendarItemOut] = []

    hearings = (
        db.query(Case)
        .filter(Case.law_firm_id == law_firm_id, Case.next_hearing_date.isnot(None))
        .all()
    )
    for case in hearings:
        events.append(
            CalendarItemOut(
                event_type="hearing",
                date=case.next_hearing_date,
                title=f"Duruşma - {case.case_name}",
                case_id=case.id,
                case_name=case.case_name,
            )
        )

    tasks = (
        db.query(Task, Case.case_name)
        .join(Case, Task.case_id == Case.id)
        .filter(
            Task.law_firm_id == law_firm_id,
            Task.due_date.isnot(None),
            Task.status == TaskStatus.PENDING,
        )
        .all()
    )
    for task, case_name in tasks:
        events.append(
            CalendarItemOut(
                event_type="task",
                date=task.due_date,
                title=task.title,
                case_id=task.case_id,
                case_name=case_name,
                task_id=task.id,
            )
        )

    events.sort(key=lambda e: e.date)
    return events


EVENT_NOT_FOUND = "Etkinlik bulunamadı"


def _owned_event_or_404(service: CalendarService, event_id: str, law_firm_id: str):
    event = service.get_event(event_id, law_firm_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EVENT_NOT_FOUND)
    return event


@router.post("/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
def create_calendar_event(
    payload: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return CalendarService(db).create_event(
            current_user.law_firm_id, current_user.id, payload, today=local_today()
        )
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


@router.get("/events/{event_id}", response_model=CalendarEventOut)
def get_calendar_event(
    event_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _owned_event_or_404(CalendarService(db), event_id, law_firm_id)


@router.patch("/events/{event_id}", response_model=CalendarEventOut)
def update_calendar_event(
    event_id: str,
    payload: CalendarEventUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CalendarService(db)
    event = _owned_event_or_404(service, event_id, law_firm_id)
    try:
        return service.update_event(event, payload, today=local_today())
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar_event(
    event_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CalendarService(db)
    service.delete_event(_owned_event_or_404(service, event_id, law_firm_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Append to `backend/app/api/routes/tasks.py`:

```python
@tasks_router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    """Firm-wide task update (used by the calendar for status and reminder_days)."""
    service = TaskService(db)
    task = service.get(task_id, law_firm_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return service.update_task(task, payload)
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/api/test_calendar_events.py tests/api/test_tasks.py tests/integration/test_calendar_migration.py tests/api/test_calendar.py -q`
Expected: 40 passed (existing calendar tests unchanged and green).

Also run: `cd backend && DATABASE_URL=sqlite:////tmp/cb_mig.db JWT_SECRET=x alembic upgrade head && DATABASE_URL=sqlite:////tmp/cb_mig.db JWT_SECRET=x alembic current; rm -f /tmp/cb_mig.db`
Expected: `e2a4c6b8d0f1 (head)`.

- [ ] **Step: Commit**

```bash
git add backend/app/core/timeutil.py backend/app/domain/calendar.py backend/app/models/calendar.py backend/app/models/__init__.py backend/app/models/task.py backend/alembic/versions/e2a4c6b8d0f1_add_calendar_events.py backend/app/schemas/calendar.py backend/app/schemas/task.py backend/app/services/calendar_service.py backend/app/api/routes/calendar.py backend/app/api/routes/tasks.py backend/tests/api/test_calendar_events.py backend/tests/integration/test_calendar_migration.py backend/tests/api/test_tasks.py
git commit -F - <<'EOF'
feat(calendar): calendar events CRUD, task reminder_days and hearing date sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 3: Calendar list API v2 (range, unified items, hearing de-dup)

**Files:**
- Modify: `backend/app/schemas/calendar.py`, `backend/app/services/calendar_service.py`, `backend/app/api/routes/calendar.py`
- Test: `backend/tests/api/test_calendar.py`

**Interfaces:**
- Consumes: Task 2 (`CalendarEvent`, `CalendarService`, `local_today`, `HEARING_REMINDER_DAYS`, `task_reminder_days`).
- Produces: `CalendarService.list_items(law_firm_id: str, start: date, end: date) -> list[CalendarItemOut]`; `GET /calendar?from&to` returning `CalendarItemOut` rows: `id, kind, event_type, title, date, start, end, all_day, case_id, case_name, task_id, event_id, assignee_id, assignee_name, location, notes, reminder_days, editable`. Constants in the route module: `DEFAULT_PAST_DAYS = 31`, `DEFAULT_FUTURE_DAYS = 62`, `MAX_RANGE_DAYS = 400`. Sorting: by date, all-day before timed, then start time, then title. Tasks: pending only, `notes` = task description, `editable=false`. Case hearings: title `Duruşma - <case_name>`, `location` = court, `reminder_days=[3, 1]`, `editable=false`.

- [ ] **Step 1: Write the failing tests**

The existing tests call `/calendar` without a range; with the new default window (today −31/+62) their fixed 2026 dates would drift out of range over time, so pin them.

Apply to `backend/tests/api/test_calendar.py`:

```diff
diff --git a/backend/tests/api/test_calendar.py b/backend/tests/api/test_calendar.py
--- a/backend/tests/api/test_calendar.py
+++ b/backend/tests/api/test_calendar.py
@@ -1,5 +1,8 @@
-"""Calendar API (Phase 4 - Takvim): merges case hearing dates and
-task due dates into one firm-wide chronological view."""
+"""Calendar API (Takvim): merges calendar events, task due dates and case
+hearing dates into one firm-wide chronological view."""
+from datetime import date
+
+RANGE_2026 = {"from": "2026-01-01", "to": "2026-12-31"}
 
 VALID_CASE_PAYLOAD = {
     "case_number": "2026/801",
@@ -33,7 +36,7 @@ def test_calendar_includes_case_hearing_date(client, two_firms_two_users):
     case = _create_case(client, headers)
     client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-10-05"}, headers=headers)
 
-    response = client.get("/calendar", headers=headers)
+    response = client.get("/calendar", params=RANGE_2026, headers=headers)
     assert response.status_code == 200
     body = response.json()
     hearing_events = [e for e in body if e["event_type"] == "hearing"]
@@ -51,7 +54,7 @@ def test_calendar_includes_task_due_date(client, two_firms_two_users):
         headers=headers,
     )
 
-    response = client.get("/calendar", headers=headers)
+    response = client.get("/calendar", params=RANGE_2026, headers=headers)
     assert response.status_code == 200
     body = response.json()
     task_events = [e for e in body if e["event_type"] == "task"]
@@ -70,7 +73,7 @@ def test_calendar_sorted_chronologically(client, two_firms_two_users):
         headers=headers,
     )
 
-    response = client.get("/calendar", headers=headers)
+    response = client.get("/calendar", params=RANGE_2026, headers=headers)
     dates = [e["date"] for e in response.json()]
     assert dates == sorted(dates)
 
@@ -82,7 +85,7 @@ def test_calendar_isolated_by_law_firm(client, two_firms_two_users):
     case = _create_case(client, headers_a, case_number="2026/804")
     client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-11-01"}, headers=headers_a)
 
-    response = client.get("/calendar", headers=headers_b)
+    response = client.get("/calendar", params=RANGE_2026, headers=headers_b)
     assert response.status_code == 200
     assert response.json() == []
 
@@ -96,9 +99,168 @@ def test_calendar_task_events_carry_task_id(client, two_firms_two_users):
         headers=headers,
     ).json()
 
-    body = client.get("/calendar", headers=headers).json()
+    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
 
     task_event = next(e for e in body if e["event_type"] == "task")
     hearing_event = next(e for e in body if e["event_type"] == "hearing")
     assert task_event["task_id"] == task["id"]
     assert hearing_event["task_id"] is None
+
+
+def _create_event(client, headers, **overrides):
+    payload = {"title": "Müvekkil toplantısı", "event_type": "meeting", "starts_at": "2026-10-07T14:30:00", **overrides}
+    response = client.post("/calendar/events", json=payload, headers=headers)
+    assert response.status_code == 201
+    return response.json()
+
+
+def test_calendar_lists_events_with_the_unified_fields(client, two_firms_two_users):
+    fixtures = two_firms_two_users
+    headers = _auth_headers(client, fixtures)
+    case = _create_case(client, headers, case_number="2026/810")
+    event = _create_event(
+        client, headers, case_id=case["id"], assignee_id=fixtures["user_a"].id,
+        duration_minutes=90, location="Büro", notes="Belgeleri getir", reminder_days=[3],
+    )
+
+    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+
+    assert body == [
+        {
+            "id": f"event:{event['id']}",
+            "kind": "event",
+            "event_type": "meeting",
+            "title": "Müvekkil toplantısı",
+            "date": "2026-10-07",
+            "start": "2026-10-07T14:30:00",
+            "end": "2026-10-07T16:00:00",
+            "all_day": False,
+            "case_id": case["id"],
+            "case_name": VALID_CASE_PAYLOAD["case_name"],
+            "task_id": None,
+            "event_id": event["id"],
+            "assignee_id": fixtures["user_a"].id,
+            "assignee_name": "Avukat A",
+            "location": "Büro",
+            "notes": "Belgeleri getir",
+            "reminder_days": [3],
+            "editable": True,
+        }
+    ]
+
+
+def test_all_day_events_have_no_start_or_end(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    _create_event(client, headers, all_day=True)
+
+    item = client.get("/calendar", params=RANGE_2026, headers=headers).json()[0]
+
+    assert (item["all_day"], item["start"], item["end"], item["case_id"]) == (True, None, None, None)
+
+
+def test_task_and_hearing_items_carry_kind_assignee_and_default_reminders(client, two_firms_two_users):
+    fixtures = two_firms_two_users
+    headers = _auth_headers(client, fixtures)
+    case = _create_case(
+        client, headers, case_number="2026/811", next_hearing_date="2026-10-09",
+        assigned_lawyer_id=fixtures["user_a"].id,
+    )
+    task = client.post(
+        f"/cases/{case['id']}/tasks",
+        json={"title": "Delil listesi", "due_date": "2026-10-08", "assigned_to": fixtures["user_a"].id},
+        headers=headers,
+    ).json()
+
+    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+    task_item = next(item for item in body if item["kind"] == "task")
+    hearing_item = next(item for item in body if item["kind"] == "case_hearing")
+
+    assert task_item["id"] == f"task:{task['id']}"
+    assert (task_item["event_type"], task_item["all_day"], task_item["editable"]) == ("task", True, False)
+    assert task_item["reminder_days"] == [1]
+    assert task_item["assignee_name"] == "Avukat A"
+    assert hearing_item["id"] == f"hearing:{case['id']}"
+    assert hearing_item["event_type"] == "hearing"
+    assert hearing_item["title"] == f"Duruşma - {VALID_CASE_PAYLOAD['case_name']}"
+    assert hearing_item["reminder_days"] == [3, 1]
+    assert hearing_item["assignee_id"] == fixtures["user_a"].id
+    assert hearing_item["location"] == VALID_CASE_PAYLOAD["court"]
+
+
+def test_task_items_show_their_own_reminder_days(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    case = _create_case(client, headers, case_number="2026/812")
+    task = client.post(
+        f"/cases/{case['id']}/tasks", json={"title": "Dilekçe", "due_date": "2026-10-08"}, headers=headers
+    ).json()
+    client.patch(f"/tasks/{task['id']}", json={"reminder_days": []}, headers=headers)
+
+    item = client.get("/calendar", params=RANGE_2026, headers=headers).json()[0]
+
+    assert item["reminder_days"] == []
+
+
+def test_case_hearing_is_hidden_when_a_hearing_event_exists_that_day(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    case = _create_case(client, headers, case_number="2026/813", next_hearing_date="2026-10-09")
+    other_day = _create_case(client, headers, case_number="2026/814", next_hearing_date="2026-10-10")
+    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case["id"], starts_at="2026-10-09T10:00:00")
+    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=other_day["id"], starts_at="2026-10-11T10:00:00")
+
+    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+
+    assert [(item["kind"], item["case_id"], item["date"]) for item in body] == [
+        ("event", case["id"], "2026-10-09"),
+        ("case_hearing", other_day["id"], "2026-10-10"),
+        ("event", other_day["id"], "2026-10-11"),
+    ]
+
+
+def test_calendar_filters_by_date_range(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    _create_event(client, headers, title="Önce", starts_at="2026-09-30T23:30:00")
+    _create_event(client, headers, title="İlk gün", starts_at="2026-10-01T00:00:00")
+    _create_event(client, headers, title="Son gün", starts_at="2026-10-31T23:59:00")
+    _create_event(client, headers, title="Sonra", starts_at="2026-11-01T00:00:00")
+
+    body = client.get("/calendar", params={"from": "2026-10-01", "to": "2026-10-31"}, headers=headers).json()
+
+    assert [item["title"] for item in body] == ["İlk gün", "Son gün"]
+
+
+def test_calendar_default_range_is_31_days_back_and_62_days_ahead(client, two_firms_two_users, monkeypatch):
+    monkeypatch.setattr("app.api.routes.calendar.local_today", lambda: date(2026, 10, 2))
+    headers = _auth_headers(client, two_firms_two_users)
+    for title, day in [("A", "2026-08-31"), ("B", "2026-09-01"), ("C", "2026-12-03"), ("D", "2026-12-04")]:
+        _create_event(client, headers, title=title, starts_at=f"{day}T10:00:00")
+
+    body = client.get("/calendar", headers=headers).json()
+
+    assert [item["title"] for item in body] == ["B", "C"]
+
+
+def test_calendar_sorts_all_day_items_before_timed_ones_within_a_day(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    _create_event(client, headers, title="Öğleden sonra", starts_at="2026-10-07T15:00:00")
+    _create_event(client, headers, title="Sabah", starts_at="2026-10-07T09:00:00")
+    _create_event(client, headers, title="Tüm gün", all_day=True, starts_at="2026-10-07T00:00:00")
+
+    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+
+    assert [item["title"] for item in body] == ["Tüm gün", "Sabah", "Öğleden sonra"]
+
+
+def test_calendar_rejects_inverted_or_too_long_ranges(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    inverted = client.get("/calendar", params={"from": "2026-10-31", "to": "2026-10-01"}, headers=headers)
+    too_long = client.get("/calendar", params={"from": "2026-01-01", "to": "2027-12-31"}, headers=headers)
+    assert (inverted.status_code, too_long.status_code) == (422, 422)
+
+
+def test_calendar_events_are_isolated_by_firm(client, two_firms_two_users):
+    fixtures = two_firms_two_users
+    _create_event(client, _auth_headers(client, fixtures, "user_a"))
+
+    body = client.get("/calendar", params=RANGE_2026, headers=_auth_headers(client, fixtures, "user_b")).json()
+
+    assert body == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/api/test_calendar.py -q`
Expected: the new tests FAIL (`KeyError: 'kind'` / response lacks `id`; range filter ignored; 200 instead of 422).

- [ ] **Step 3: Implement**

In `backend/app/schemas/calendar.py`, replace the `CalendarItemOut` class with:

```python
class CalendarItemOut(BaseModel):
    """One row of GET /calendar: a calendar event, a pending task's due date
    or a case's next hearing. The legacy fields (date, title, case_id,
    case_name, task_id, event_type "hearing"/"task") keep their meaning."""

    id: str  # "event:<id>", "task:<id>" or "hearing:<case_id>"
    kind: Literal["event", "task", "case_hearing"]
    event_type: Literal["hearing", "meeting", "client_meeting", "other", "task"]
    title: str
    date: date
    start: Optional[datetime] = None  # only for timed events
    end: Optional[datetime] = None
    all_day: bool
    case_id: Optional[str] = None
    case_name: Optional[str] = None
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    reminder_days: list[int]
    editable: bool
```

Replace `backend/app/services/calendar_service.py` with:

```python
"""Calendar events (CRUD) and the firm-wide calendar list.

Every query is scoped by law_firm_id. A referenced case or assignee from
another firm is reported as "not found" (404), never as "forbidden".
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.timeutil import to_local_naive
from app.domain.calendar import HEARING_REMINDER_DAYS, default_event_reminder_days, task_reminder_days
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarItemOut


class CalendarReferenceNotFound(Exception):
    """A referenced case or user is not in the caller's firm."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class CalendarService:
    def __init__(self, db: Session):
        self.db = db

    # ----- events -----

    def create_event(
        self, law_firm_id: str, created_by: str, payload: CalendarEventCreate, today: date
    ) -> CalendarEvent:
        case = self._check_references(law_firm_id, payload.case_id, payload.assignee_id)
        reminder_days = (
            payload.reminder_days
            if payload.reminder_days is not None
            else default_event_reminder_days(payload.event_type)
        )
        event = CalendarEvent(
            law_firm_id=law_firm_id,
            title=payload.title,
            event_type=payload.event_type,
            starts_at=_normalize_start(payload.starts_at, payload.all_day),
            all_day=payload.all_day,
            duration_minutes=payload.duration_minutes,
            location=payload.location,
            notes=payload.notes,
            case_id=payload.case_id,
            assignee_id=payload.assignee_id,
            created_by=created_by,
            reminder_days=reminder_days,
        )
        self.db.add(event)
        _sync_next_hearing(event, case, today)
        self.db.commit()
        self.db.refresh(event)
        return event

    def get_event(self, event_id: str, law_firm_id: str) -> Optional[CalendarEvent]:
        return (
            self.db.query(CalendarEvent)
            .filter(CalendarEvent.id == event_id, CalendarEvent.law_firm_id == law_firm_id)
            .first()
        )

    def update_event(self, event: CalendarEvent, payload: CalendarEventUpdate, today: date) -> CalendarEvent:
        updates = payload.model_dump(exclude_unset=True)
        self._check_references(event.law_firm_id, updates.get("case_id"), updates.get("assignee_id"))
        for field, value in updates.items():
            setattr(event, field, value)
        event.starts_at = _normalize_start(event.starts_at, event.all_day)
        case = self._case_in_firm(event.case_id, event.law_firm_id) if event.case_id else None
        _sync_next_hearing(event, case, today)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete_event(self, event: CalendarEvent) -> None:
        self.db.delete(event)
        self.db.commit()

    # ----- calendar list -----

    def list_items(self, law_firm_id: str, start: date, end: date) -> list[CalendarItemOut]:
        """Events, pending task due dates and case hearings with a date in
        [start, end]. A case hearing is hidden when a hearing event of the
        same case exists on the same day."""
        events = (
            self.db.query(CalendarEvent, Case.case_name)
            .outerjoin(Case, CalendarEvent.case_id == Case.id)
            .filter(
                CalendarEvent.law_firm_id == law_firm_id,
                CalendarEvent.starts_at >= datetime.combine(start, time.min),
                CalendarEvent.starts_at < datetime.combine(end + timedelta(days=1), time.min),
            )
            .all()
        )
        tasks = (
            self.db.query(Task, Case.case_name)
            .join(Case, Task.case_id == Case.id)
            .filter(
                Task.law_firm_id == law_firm_id,
                Task.status == TaskStatus.PENDING,
                Task.due_date >= start,
                Task.due_date <= end,
            )
            .all()
        )
        cases = (
            self.db.query(Case)
            .filter(Case.law_firm_id == law_firm_id, Case.next_hearing_date >= start, Case.next_hearing_date <= end)
            .all()
        )

        hearing_event_days = {
            (event.case_id, event.starts_at.date())
            for event, _ in events
            if event.event_type == CalendarEventType.HEARING and event.case_id
        }
        names = self._user_names(
            law_firm_id,
            {event.assignee_id for event, _ in events}
            | {task.assigned_to for task, _ in tasks}
            | {case.assigned_lawyer_id for case in cases},
        )

        items = [_event_item(event, case_name, names) for event, case_name in events]
        items += [_task_item(task, case_name, names) for task, case_name in tasks]
        items += [
            _hearing_item(case, names)
            for case in cases
            if (case.id, case.next_hearing_date) not in hearing_event_days
        ]
        items.sort(key=lambda item: (item.date, item.start is not None, item.start or datetime.min, item.title))
        return items

    def _user_names(self, law_firm_id: str, user_ids: set[Optional[str]]) -> dict[str, str]:
        ids = {user_id for user_id in user_ids if user_id}
        if not ids:
            return {}
        rows = self.db.query(User.id, User.full_name).filter(User.law_firm_id == law_firm_id, User.id.in_(ids)).all()
        return {user_id: full_name for user_id, full_name in rows}

    # ----- helpers -----

    def _case_in_firm(self, case_id: str, law_firm_id: str) -> Optional[Case]:
        return self.db.query(Case).filter(Case.id == case_id, Case.law_firm_id == law_firm_id).first()

    def _check_references(
        self, law_firm_id: str, case_id: Optional[str], assignee_id: Optional[str]
    ) -> Optional[Case]:
        case = None
        if case_id is not None:
            case = self._case_in_firm(case_id, law_firm_id)
            if case is None:
                raise CalendarReferenceNotFound("Dava bulunamadı")
        if assignee_id is not None and UserRepository(self.db).get_by_id_in_firm(assignee_id, law_firm_id) is None:
            raise CalendarReferenceNotFound("Kullanıcı bulunamadı")
        return case


def _event_item(event: CalendarEvent, case_name: Optional[str], names: dict[str, str]) -> CalendarItemOut:
    timed = not event.all_day
    return CalendarItemOut(
        id=f"event:{event.id}",
        kind="event",
        event_type=CalendarEventType(event.event_type).value,
        title=event.title,
        date=event.starts_at.date(),
        start=event.starts_at if timed else None,
        end=event.starts_at + timedelta(minutes=event.duration_minutes) if timed else None,
        all_day=event.all_day,
        case_id=event.case_id,
        case_name=case_name,
        event_id=event.id,
        assignee_id=event.assignee_id,
        assignee_name=names.get(event.assignee_id) if event.assignee_id else None,
        location=event.location,
        notes=event.notes,
        reminder_days=list(event.reminder_days or []),
        editable=True,
    )


def _task_item(task: Task, case_name: str, names: dict[str, str]) -> CalendarItemOut:
    return CalendarItemOut(
        id=f"task:{task.id}",
        kind="task",
        event_type="task",
        title=task.title,
        date=task.due_date,
        all_day=True,
        case_id=task.case_id,
        case_name=case_name,
        task_id=task.id,
        assignee_id=task.assigned_to,
        assignee_name=names.get(task.assigned_to) if task.assigned_to else None,
        notes=task.description,
        reminder_days=task_reminder_days(task.reminder_days),
        editable=False,
    )


def _hearing_item(case: Case, names: dict[str, str]) -> CalendarItemOut:
    return CalendarItemOut(
        id=f"hearing:{case.id}",
        kind="case_hearing",
        event_type="hearing",
        title=f"Duruşma - {case.case_name}",
        date=case.next_hearing_date,
        all_day=True,
        case_id=case.id,
        case_name=case.case_name,
        assignee_id=case.assigned_lawyer_id,
        assignee_name=names.get(case.assigned_lawyer_id) if case.assigned_lawyer_id else None,
        location=case.court,
        reminder_days=list(HEARING_REMINDER_DAYS),
        editable=False,
    )


def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
    local = to_local_naive(starts_at).replace(second=0, microsecond=0)
    if all_day:
        local = local.replace(hour=0, minute=0)
    return local


def _sync_next_hearing(event: CalendarEvent, case: Optional[Case], today: date) -> None:
    """A hearing event on or after today pulls the case's next_hearing_date
    earlier (or sets it when empty); it never pushes it later."""
    if case is None or event.event_type != CalendarEventType.HEARING:
        return
    day = event.starts_at.date()
    if day < today:
        return
    if case.next_hearing_date is None or case.next_hearing_date > day:
        case.next_hearing_date = day
```

Replace `backend/app/api/routes/calendar.py` with:

```python
"""Firm-wide calendar (Takvim).

GET /calendar merges calendar events, pending task due dates and case
hearing dates within a date range into one chronological list.
/calendar/events is CRUD for user-created events. Everything is scoped
to the caller's firm.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarItemOut
from app.services.calendar_service import CalendarReferenceNotFound, CalendarService

router = APIRouter(prefix="/calendar", tags=["calendar"])

DEFAULT_PAST_DAYS = 31
DEFAULT_FUTURE_DAYS = 62
MAX_RANGE_DAYS = 400
EVENT_NOT_FOUND = "Etkinlik bulunamadı"


@router.get("", response_model=list[CalendarItemOut])
def list_calendar_items(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    today = local_today()
    start = from_date or today - timedelta(days=DEFAULT_PAST_DAYS)
    end = to_date or today + timedelta(days=DEFAULT_FUTURE_DAYS)
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Başlangıç tarihi bitiş tarihinden sonra olamaz.",
        )
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tarih aralığı en fazla {MAX_RANGE_DAYS} gün olabilir.",
        )
    return CalendarService(db).list_items(law_firm_id, start, end)


def _owned_event_or_404(service: CalendarService, event_id: str, law_firm_id: str):
    event = service.get_event(event_id, law_firm_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EVENT_NOT_FOUND)
    return event


@router.post("/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
def create_calendar_event(
    payload: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return CalendarService(db).create_event(
            current_user.law_firm_id, current_user.id, payload, today=local_today()
        )
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


@router.get("/events/{event_id}", response_model=CalendarEventOut)
def get_calendar_event(
    event_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _owned_event_or_404(CalendarService(db), event_id, law_firm_id)


@router.patch("/events/{event_id}", response_model=CalendarEventOut)
def update_calendar_event(
    event_id: str,
    payload: CalendarEventUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CalendarService(db)
    event = _owned_event_or_404(service, event_id, law_firm_id)
    try:
        return service.update_event(event, payload, today=local_today())
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar_event(
    event_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CalendarService(db)
    service.delete_event(_owned_event_or_404(service, event_id, law_firm_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/api/test_calendar.py tests/api/test_calendar_events.py -q`
Expected: 38 passed.

- [ ] **Step: Commit**

```bash
git add backend/app/schemas/calendar.py backend/app/services/calendar_service.py backend/app/api/routes/calendar.py backend/tests/api/test_calendar.py
git commit -F - <<'EOF'
feat(calendar): date-range calendar list with events, tasks and de-duplicated hearings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 4: Reminder service — due computation, recipients, deliveries, e-mail content

**Files:**
- Modify: `backend/app/models/calendar.py`, `backend/app/models/__init__.py`, `backend/app/services/notification_content.py`
- Create: `backend/alembic/versions/f3b5d7e9a1c2_add_reminder_deliveries.py`, `backend/app/services/reminder_service.py`
- Test: `backend/tests/unit/test_reminder_service.py` (new), `backend/tests/unit/test_notification_content.py` (new), `backend/tests/integration/test_calendar_migration.py`

**Interfaces:**
- Consumes: `send_email`, `EmailSendError`, `EmailMessage` (Task 1); `CalendarEvent`, `TYPE_LABELS`, `HEARING_REMINDER_DAYS`, `MAX_REMINDER_DAYS`, `task_reminder_days` (Task 2).
- Produces:
  - `app.models.calendar`: `ReminderSourceType` (`event|task|case_hearing`), `ReminderDeliveryStatus` (`sent|failed`), `ReminderDelivery` (table `reminder_deliveries`, unique `uq_reminder_deliveries_occurrence`).
  - `app.services.reminder_service`: `due_offsets(occurrence: date, reminder_days: list[int], today: date) -> list[int]`; `DueReminder` (frozen dataclass: `source_type, source_id, law_firm_id, occurrence_date, days_before: tuple[int, ...], recipient_id, recipient_email, type_label, title, starts_at: Optional[datetime], location, case_id, case_name`); `ReminderRunResult(sent: int = 0, failed: int = 0)`; `ReminderService(db, sender: Optional[Callable[[EmailMessage], None]] = None)` with `collect_due(now_local: datetime) -> list[DueReminder]` and `send_due(now_local: datetime) -> ReminderRunResult`.
  - `app.services.notification_content`: `day_phrase(days_until: int) -> str`, `build_reminder_email(due: DueReminder, today: date) -> EmailMessage`.
- Behaviour notes: several due offsets of one occurrence (catch-up) go out as ONE e-mail and each offset gets its own delivery row; the day phrase uses the real distance `D - today`; archived cases get no hearing reminders; a hearing reminder needs `assigned_lawyer_id` (cases have no creator).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_reminder_service.py`:

```python
"""Reminder rules with a fixed local clock: due computation, catch-up,
recipients, no duplicates, re-scheduling and retry limits."""
from datetime import date, datetime

import pytest

from app.services.email import EmailSendError
from app.services.reminder_service import ReminderService, due_offsets

NOW = datetime(2026, 10, 2, 9, 30)  # Friday morning, local time
TODAY = NOW.date()


class Outbox:
    def __init__(self, fail_with=None):
        self.messages = []
        self.fail_with = fail_with

    def __call__(self, message):
        if self.fail_with is not None:
            raise self.fail_with
        self.messages.append(message)


@pytest.fixture()
def world(db_session):
    from app.models.case import Case, CaseStatus, CaseType
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Büro A")
    other_firm = LawFirm(name="Büro B")
    db_session.add_all([firm, other_firm])
    db_session.flush()

    def user(email, firm_id=firm.id, active=True):
        u = User(law_firm_id=firm_id, email=email, hashed_password="x", full_name=email.split("@")[0],
                 role=UserRole.LAWYER, is_active=active)
        db_session.add(u)
        db_session.flush()
        return u

    lawyer = user("avukat@a.test")
    creator = user("olusturan@a.test")
    passive = user("pasif@a.test", active=False)
    outsider = user("avukat@b.test", firm_id=other_firm.id)
    case = Case(law_firm_id=firm.id, case_number="2026/1", case_name="Ticari Kira Uyarlama Davası",
                client_name="Deniz", case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN,
                assigned_lawyer_id=lawyer.id, court="İstanbul 3. Asliye Ticaret")
    db_session.add(case)
    db_session.commit()
    return {"db": db_session, "firm": firm, "other_firm": other_firm, "lawyer": lawyer, "creator": creator,
            "passive": passive, "outsider": outsider, "case": case}


def add_event(world, starts_at, reminder_days, **extra):
    from app.models.calendar import CalendarEvent, CalendarEventType

    event = CalendarEvent(
        law_firm_id=extra.pop("law_firm_id", world["firm"].id),
        title=extra.pop("title", "Müvekkil toplantısı"),
        event_type=extra.pop("event_type", CalendarEventType.MEETING),
        starts_at=starts_at,
        all_day=extra.pop("all_day", False),
        duration_minutes=60,
        created_by=extra.pop("created_by", world["creator"].id),
        reminder_days=reminder_days,
        **extra,
    )
    world["db"].add(event)
    world["db"].commit()
    return event


def add_task(world, due_date, **extra):
    from app.models.task import Task

    task = Task(case_id=world["case"].id, law_firm_id=world["firm"].id, title=extra.pop("title", "Dilekçe hazırla"),
                due_date=due_date, created_by=world["creator"].id, **extra)
    world["db"].add(task)
    world["db"].commit()
    return task


def deliveries(world):
    from app.models.calendar import ReminderDelivery

    return world["db"].query(ReminderDelivery).order_by(ReminderDelivery.days_before.desc()).all()


# ----- due_offsets (pure) -----


@pytest.mark.parametrize(
    "occurrence,days,today,expected",
    [
        (date(2026, 10, 5), [3, 1], date(2026, 10, 2), [3]),  # exactly 3 days before
        (date(2026, 10, 5), [3, 1], date(2026, 10, 1), []),  # too early
        (date(2026, 10, 5), [3, 1], date(2026, 10, 3), [3]),  # missed 3-day reminder caught up
        (date(2026, 10, 5), [3, 1], date(2026, 10, 4), [3, 1]),  # both due, 3 caught up
        (date(2026, 10, 5), [3, 1], date(2026, 10, 5), []),  # on the day only d=0 is sent
        (date(2026, 10, 5), [1, 0], date(2026, 10, 5), [0]),
        (date(2026, 10, 1), [3, 1, 0], date(2026, 10, 2), []),  # past occurrence
        (date(2026, 10, 5), [], date(2026, 10, 4), []),
    ],
)
def test_due_offsets(occurrence, days, today, expected):
    assert due_offsets(occurrence, days, today) == expected


# ----- collect_due -----


def test_nothing_is_due_before_the_send_hour(world):
    add_event(world, datetime(2026, 10, 3, 14, 0), [1], assignee_id=world["lawyer"].id)
    service = ReminderService(world["db"])
    assert service.collect_due(datetime(2026, 10, 2, 8, 59)) == []
    assert len(service.collect_due(datetime(2026, 10, 2, 9, 0))) == 1


def test_event_reminder_goes_to_the_assignee_with_event_details(world):
    event = add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id,
                      case_id=world["case"].id, location="Büro")

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.occurrence_date) == ("event", event.id, date(2026, 10, 5))
    assert due.days_before == (3,)
    assert (due.recipient_id, due.recipient_email) == (world["lawyer"].id, "avukat@a.test")
    assert (due.type_label, due.title, due.location) == ("Toplantı", "Müvekkil toplantısı", "Büro")
    assert due.starts_at == datetime(2026, 10, 5, 14, 30)
    assert (due.case_id, due.case_name) == (world["case"].id, "Ticari Kira Uyarlama Davası")


def test_event_without_assignee_reminds_its_creator(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1])
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.recipient_id == world["creator"].id


def test_inactive_recipient_is_skipped(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["passive"].id)
    assert ReminderService(world["db"]).collect_due(NOW) == []


def test_all_day_events_have_no_time(world):
    add_event(world, datetime(2026, 10, 3, 0, 0), [1], all_day=True)
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.starts_at is None


def test_pending_task_reminds_its_assignee_with_default_one_day(world):
    from app.models.task import TaskStatus

    task = add_task(world, date(2026, 10, 3), assigned_to=world["lawyer"].id)
    add_task(world, date(2026, 10, 3), title="Bitti", status=TaskStatus.COMPLETED)
    add_task(world, date(2026, 10, 3), title="Sessiz", reminder_days=[])

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.days_before) == ("task", task.id, (1,))
    assert (due.recipient_id, due.type_label, due.title) == (world["lawyer"].id, "Görev", "Dilekçe hazırla")


def test_unassigned_task_reminds_its_creator(world):
    add_task(world, date(2026, 10, 3))
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.recipient_id == world["creator"].id


def test_case_hearing_reminds_the_assigned_lawyer_three_days_before(world):
    world["case"].next_hearing_date = date(2026, 10, 5)
    world["db"].commit()

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.days_before) == ("case_hearing", world["case"].id, (3,))
    assert (due.type_label, due.title, due.location) == ("Duruşma", "Ticari Kira Uyarlama Davası", "İstanbul 3. Asliye Ticaret")
    assert due.recipient_id == world["lawyer"].id


def test_case_hearing_without_lawyer_or_archived_is_skipped(world):
    world["case"].next_hearing_date = date(2026, 10, 5)
    world["case"].assigned_lawyer_id = None
    world["db"].commit()
    assert ReminderService(world["db"]).collect_due(NOW) == []

    world["case"].assigned_lawyer_id = world["lawyer"].id
    world["case"].is_archived = True
    world["db"].commit()
    assert ReminderService(world["db"]).collect_due(NOW) == []


def test_case_hearing_is_skipped_when_a_hearing_event_exists_that_day(world):
    from app.models.calendar import CalendarEventType

    world["case"].next_hearing_date = date(2026, 10, 5)
    world["db"].commit()
    event = add_event(world, datetime(2026, 10, 5, 10, 0), [3, 1], event_type=CalendarEventType.HEARING,
                      title="Duruşma", case_id=world["case"].id, assignee_id=world["lawyer"].id)

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.type_label) == ("event", event.id, "Duruşma")


def test_sources_of_every_firm_are_collected_but_recipients_must_match_the_firm(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], law_firm_id=world["other_firm"].id,
              created_by=world["outsider"].id)
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["outsider"].id)  # foreign assignee

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.law_firm_id, due.recipient_id) == (world["other_firm"].id, world["outsider"].id)


# ----- send_due -----


def test_send_due_sends_once_and_records_the_delivery(world):
    add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id)
    outbox = Outbox()
    service = ReminderService(world["db"], sender=outbox)

    assert service.send_due(NOW).sent == 1
    assert service.send_due(datetime(2026, 10, 2, 17, 0)).sent == 0  # same day, later poll

    assert [m.subject for m in outbox.messages] == ["Hatırlatma: 3 gün sonra Toplantı – Müvekkil toplantısı"]
    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.days_before, row.last_error) == ("sent", 1, 3, None)
    assert row.sent_at is not None


def test_missed_offsets_are_merged_into_one_email(world):
    add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id)
    outbox = Outbox()

    result = ReminderService(world["db"], sender=outbox).send_due(datetime(2026, 10, 4, 9, 0))

    assert result.sent == 1
    assert [m.subject for m in outbox.messages] == ["Hatırlatma: yarın Toplantı – Müvekkil toplantısı"]
    assert [(row.days_before, row.status.value) for row in deliveries(world)] == [(3, "sent"), (1, "sent")]


def test_moving_an_event_to_another_day_schedules_a_new_reminder(world):
    event = add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    outbox = Outbox()
    service = ReminderService(world["db"], sender=outbox)
    service.send_due(NOW)

    event.starts_at = datetime(2026, 10, 4, 10, 0)
    world["db"].commit()
    service.send_due(datetime(2026, 10, 3, 9, 0))

    assert len(outbox.messages) == 2
    assert {row.occurrence_date for row in deliveries(world)} == {date(2026, 10, 3), date(2026, 10, 4)}


def test_failures_are_recorded_and_retried_up_to_the_attempt_limit(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    failing = Outbox(fail_with=EmailSendError("SMTPServerDisconnected"))
    service = ReminderService(world["db"], sender=failing)

    for _ in range(3):
        assert service.send_due(NOW).failed == 1
    assert service.send_due(NOW).failed == 0  # attempts exhausted (REMINDER_MAX_ATTEMPTS=3)

    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.last_error, row.sent_at) == ("failed", 3, "SMTPServerDisconnected", None)


def test_a_failed_reminder_can_succeed_on_retry(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    ReminderService(world["db"], sender=Outbox(fail_with=EmailSendError("SMTPConnectError"))).send_due(NOW)

    outbox = Outbox()
    assert ReminderService(world["db"], sender=outbox).send_due(NOW).sent == 1

    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.last_error) == ("sent", 2, None)


def test_unexpected_sender_errors_are_recorded_without_stopping_the_run(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id, title="A")
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["lawyer"].id, title="B")
    calls = []

    def flaky(message):
        calls.append(message.subject)
        if len(calls) == 1:
            raise RuntimeError("boom with secret body")

    result = ReminderService(world["db"], sender=flaky).send_due(NOW)

    assert (result.sent, result.failed) == (1, 1)
    assert {row.last_error for row in deliveries(world)} == {"RuntimeError", None}
```

Create `backend/tests/unit/test_notification_content.py`:

```python
"""Turkish reminder e-mail content."""
from datetime import date, datetime

import pytest

from app.models.calendar import ReminderSourceType
from app.services.notification_content import build_reminder_email, day_phrase
from app.services.reminder_service import DueReminder


def _due(**overrides):
    values = dict(
        source_type=ReminderSourceType.EVENT,
        source_id="e1",
        law_firm_id="f1",
        occurrence_date=date(2026, 10, 5),
        days_before=(3,),
        recipient_id="u1",
        recipient_email="avukat@demo.casebridge.dev",
        type_label="Duruşma",
        title="Ticari Kira Uyarlama Davası",
        starts_at=datetime(2026, 10, 5, 14, 30),
        location="İstanbul 3. Asliye Ticaret",
        case_id="c1",
        case_name="Ticari Kira Uyarlama Davası",
    )
    values.update(overrides)
    return DueReminder(**values)


@pytest.mark.parametrize("days,phrase", [(0, "bugün"), (1, "yarın"), (3, "3 gün sonra"), (7, "7 gün sonra")])
def test_day_phrase(days, phrase):
    assert day_phrase(days) == phrase


def test_subject_follows_the_spec_example():
    message = build_reminder_email(_due(), date(2026, 10, 2))
    assert message.subject == "Hatırlatma: 3 gün sonra Duruşma – Ticari Kira Uyarlama Davası"
    assert message.to == "avukat@demo.casebridge.dev"


def test_body_lists_details_links_and_footer():
    message = build_reminder_email(_due(), date(2026, 10, 2))

    for line in [
        "Tür: Duruşma",
        "Başlık: Ticari Kira Uyarlama Davası",
        "Tarih: 05.10.2026",
        "Saat: 14:30",
        "Konum: İstanbul 3. Asliye Ticaret",
        "Dava: Ticari Kira Uyarlama Davası",
        "Davayı aç: http://localhost:3000/davalar/c1",
        "Takvimde gör: http://localhost:3000/takvim?ay=2026-10",
        "Bu e-posta CaseBridge tarafından otomatik gönderildi.",
    ]:
        assert line in message.text
    assert 'href="http://localhost:3000/davalar/c1"' in message.html
    assert "Bu e-posta CaseBridge tarafından otomatik gönderildi." in message.html


def test_untimed_reminder_without_case_has_no_time_or_case_link(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "app_base_url", "https://casebridge.example/")
    message = build_reminder_email(
        _due(starts_at=None, case_id=None, case_name=None, location=None, type_label="Görev", title="Dilekçe"),
        date(2026, 10, 4),
    )

    assert message.subject == "Hatırlatma: yarın Görev – Dilekçe"
    assert "Saat:" not in message.text
    assert "Davayı aç" not in message.text
    assert "Takvimde gör: https://casebridge.example/takvim?ay=2026-10" in message.text


def test_html_escapes_user_text():
    message = build_reminder_email(_due(title="<script>x</script>"), date(2026, 10, 5))
    assert "<script>" not in message.html
    assert "&lt;script&gt;" in message.html
    assert message.subject.startswith("Hatırlatma: bugün Duruşma")
```

Append to `backend/tests/integration/test_calendar_migration.py`:

```python
def test_migration_adds_reminder_deliveries(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, "f3b5d7e9a1c2")
    inspector = sa.inspect(sa.create_engine(url))
    assert "reminder_deliveries" in inspector.get_table_names()
    assert {c["name"] for c in inspector.get_unique_constraints("reminder_deliveries")} == {
        "uq_reminder_deliveries_occurrence"
    }

    command.downgrade(config, "e2a4c6b8d0f1")
    assert "reminder_deliveries" not in sa.inspect(sa.create_engine(url)).get_table_names()
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_reminder_service.py tests/unit/test_notification_content.py tests/integration/test_calendar_migration.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.reminder_service'`, `ImportError: cannot import name 'ReminderSourceType'`.

- [ ] **Step 3: Implement**

In `backend/app/models/calendar.py` change the imports to

```python
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
```

and append:

```python
class ReminderSourceType(str, enum.Enum):
    EVENT = "event"
    TASK = "task"
    CASE_HEARING = "case_hearing"


class ReminderDeliveryStatus(str, enum.Enum):
    SENT = "sent"
    FAILED = "failed"


class ReminderDelivery(Base):
    """One reminder e-mail (per source, occurrence day, offset and
    recipient). Moving an event to another day changes occurrence_date,
    so a new reminder is due for the new day."""

    __tablename__ = "reminder_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "source_type",
            "source_id",
            "occurrence_date",
            "days_before",
            "recipient_user_id",
            name="uq_reminder_deliveries_occurrence",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    source_type: Mapped[ReminderSourceType] = mapped_column(str_enum(ReminderSourceType), nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    occurrence_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_before: Mapped[int] = mapped_column(Integer, nullable=False)
    recipient_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[ReminderDeliveryStatus] = mapped_column(str_enum(ReminderDeliveryStatus), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    #: Short, content-free error code (e.g. "SMTPServerDisconnected").
    last_error: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)
```

In `backend/app/models/__init__.py` replace the calendar import line with:

```python
from app.models.calendar import (  # noqa: F401
    CalendarEvent,
    CalendarEventType,
    ReminderDelivery,
    ReminderDeliveryStatus,
    ReminderSourceType,
)
```

Create `backend/alembic/versions/f3b5d7e9a1c2_add_reminder_deliveries.py`:

```python
"""add reminder deliveries

Revision ID: f3b5d7e9a1c2
Revises: e2a4c6b8d0f1
Create Date: 2026-10-02 19:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3b5d7e9a1c2"
down_revision: Union[str, Sequence[str], None] = "e2a4c6b8d0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reminder_deliveries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column(
            "source_type",
            sa.Enum("event", "task", "case_hearing", name="remindersourcetype"),
            nullable=False,
        ),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column("recipient_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.Enum("sent", "failed", name="reminderdeliverystatus"), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(length=300), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "source_type",
            "source_id",
            "occurrence_date",
            "days_before",
            "recipient_user_id",
            name="uq_reminder_deliveries_occurrence",
        ),
    )
    op.create_index("ix_reminder_deliveries_law_firm_id", "reminder_deliveries", ["law_firm_id"])


def downgrade() -> None:
    op.drop_index("ix_reminder_deliveries_law_firm_id", table_name="reminder_deliveries")
    op.drop_table("reminder_deliveries")
    sa.Enum(name="reminderdeliverystatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="remindersourcetype").drop(op.get_bind(), checkfirst=True)
```

Replace `backend/app/services/notification_content.py` with (adds `day_phrase` and `build_reminder_email`; `DueReminder` is imported only for typing to avoid an import cycle):

```python
"""Turkish e-mail content for notifications (test e-mail, reminders)."""
from __future__ import annotations

from datetime import date
from html import escape
from typing import TYPE_CHECKING

from app.core.config import settings
from app.models.user import User
from app.services.email import EmailMessage

if TYPE_CHECKING:
    from app.services.reminder_service import DueReminder

FOOTER = "Bu e-posta CaseBridge tarafından otomatik gönderildi."
TEST_EMAIL_SUBJECT = "CaseBridge test e-postası"


def build_test_email(user: User) -> EmailMessage:
    text = (
        f"Merhaba {user.full_name},\n\n"
        "Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.\n\n"
        f"{FOOTER}\n"
    )
    html = (
        f"<p>Merhaba {escape(user.full_name)},</p>"
        "<p>Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.</p>"
        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(to=user.email, subject=TEST_EMAIL_SUBJECT, text=text, html=html)


def day_phrase(days_until: int) -> str:
    if days_until <= 0:
        return "bugün"
    if days_until == 1:
        return "yarın"
    return f"{days_until} gün sonra"


def build_reminder_email(due: DueReminder, today: date) -> EmailMessage:
    """The day phrase uses the real distance to the occurrence (a catch-up
    reminder sent the day before says "yarın")."""
    subject = f"Hatırlatma: {day_phrase((due.occurrence_date - today).days)} {due.type_label} – {due.title}"
    base_url = settings.app_base_url.rstrip("/")

    details = [("Tür", due.type_label), ("Başlık", due.title), ("Tarih", due.occurrence_date.strftime("%d.%m.%Y"))]
    if due.starts_at is not None:
        details.append(("Saat", due.starts_at.strftime("%H:%M")))
    if due.location:
        details.append(("Konum", due.location))
    if due.case_name:
        details.append(("Dava", due.case_name))

    links = []
    if due.case_id:
        links.append(("Davayı aç", f"{base_url}/davalar/{due.case_id}"))
    links.append(("Takvimde gör", f"{base_url}/takvim?ay={due.occurrence_date:%Y-%m}"))

    text = "\n".join(
        [f"{label}: {value}" for label, value in details]
        + [""]
        + [f"{label}: {url}" for label, url in links]
        + ["", FOOTER]
    ) + "\n"
    html = (
        "<table>"
        + "".join(
            f'<tr><td style="color:#6b7280;padding-right:12px">{escape(label)}</td><td>{escape(value)}</td></tr>'
            for label, value in details
        )
        + "</table><p>"
        + " · ".join(f'<a href="{escape(url)}">{escape(label)}</a>' for label, url in links)
        + f'</p><p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(to=due.recipient_email, subject=subject, text=text, html=html)
```

Create `backend/app/services/reminder_service.py`:

```python
"""E-mail reminders for calendar events, pending tasks and case hearings.

collect_due(now_local) decides what is due; send_due(now_local) sends it
and records one ReminderDelivery per offset. `now_local` is a naive
datetime in APP_TIMEZONE passed in by the caller (the worker computes it
with app.core.timeutil.local_now), so the rules are testable with a
fixed clock.

Rules (occurrence day D, offset d in reminder_days, today = now_local.date()):
  - nothing is sent before REMINDER_SEND_HOUR;
  - past occurrences (D < today) are skipped;
  - d is due when today == D - d, or when D - d < today < D (catch-up after
    downtime); several due offsets of one occurrence go out as ONE e-mail;
  - an offset already `sent` is skipped; a `failed` one is retried while
    attempts < REMINDER_MAX_ATTEMPTS;
  - recipient: event assignee, else its creator; task assignee, else its
    creator; case hearing: the case's assigned lawyer. Inactive users and
    users without an e-mail address are skipped.
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.calendar import HEARING_REMINDER_DAYS, MAX_REMINDER_DAYS, TYPE_LABELS, task_reminder_days
from app.models.calendar import (
    CalendarEvent,
    CalendarEventType,
    ReminderDelivery,
    ReminderDeliveryStatus,
    ReminderSourceType,
)
from app.models.case import Case
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.services.email import EmailMessage, EmailSendError, send_email
from app.services.notification_content import build_reminder_email

logger = logging.getLogger("casebridge")


@dataclass(frozen=True)
class DueReminder:
    source_type: ReminderSourceType
    source_id: str
    law_firm_id: str
    occurrence_date: date
    days_before: tuple[int, ...]  # every due offset, largest first
    recipient_id: str
    recipient_email: str
    type_label: str
    title: str
    starts_at: Optional[datetime]  # None for all-day events, tasks and hearings
    location: Optional[str]
    case_id: Optional[str]
    case_name: Optional[str]


@dataclass(frozen=True)
class ReminderRunResult:
    sent: int = 0
    failed: int = 0


@dataclass(frozen=True)
class _Candidate:
    source_type: ReminderSourceType
    source_id: str
    law_firm_id: str
    occurrence_date: date
    reminder_days: list[int]
    recipient_id: Optional[str]
    type_label: str
    title: str
    starts_at: Optional[datetime]
    location: Optional[str]
    case_id: Optional[str]
    case_name: Optional[str]


def due_offsets(occurrence: date, reminder_days: list[int], today: date) -> list[int]:
    """Offsets of `reminder_days` that are due today (see module docstring)."""
    if occurrence < today:
        return []
    due = []
    for days_before in sorted(set(reminder_days), reverse=True):
        send_day = occurrence - timedelta(days=days_before)
        if send_day == today or send_day < today < occurrence:
            due.append(days_before)
    return due


class ReminderService:
    def __init__(self, db: Session, sender: Optional[Callable[[EmailMessage], None]] = None):
        self.db = db
        self.sender = sender or send_email

    def collect_due(self, now_local: datetime) -> list[DueReminder]:
        if now_local.hour < settings.reminder_send_hour:
            return []
        today = now_local.date()
        last_day = today + timedelta(days=MAX_REMINDER_DAYS)
        candidates = (
            self._event_candidates(today, last_day)
            + self._task_candidates(today, last_day)
            + self._hearing_candidates(today, last_day)
        )
        users = self._users({c.recipient_id for c in candidates if c.recipient_id})

        due: list[DueReminder] = []
        for candidate in candidates:
            user = users.get(candidate.recipient_id) if candidate.recipient_id else None
            if user is None or not user.is_active or not user.email or user.law_firm_id != candidate.law_firm_id:
                continue
            offsets = self._pending_offsets(
                candidate, user.id, due_offsets(candidate.occurrence_date, candidate.reminder_days, today)
            )
            if not offsets:
                continue
            due.append(
                DueReminder(
                    source_type=candidate.source_type,
                    source_id=candidate.source_id,
                    law_firm_id=candidate.law_firm_id,
                    occurrence_date=candidate.occurrence_date,
                    days_before=tuple(offsets),
                    recipient_id=user.id,
                    recipient_email=user.email,
                    type_label=candidate.type_label,
                    title=candidate.title,
                    starts_at=candidate.starts_at,
                    location=candidate.location,
                    case_id=candidate.case_id,
                    case_name=candidate.case_name,
                )
            )
        return due

    def send_due(self, now_local: datetime) -> ReminderRunResult:
        today = now_local.date()
        sent = failed = 0
        for due in self.collect_due(now_local):
            error: Optional[str] = None
            try:
                self.sender(build_reminder_email(due, today))
            except EmailSendError as exc:
                error = str(exc) or "EmailSendError"
            except Exception as exc:  # one bad reminder must not stop the rest
                error = type(exc).__name__
            if error is not None:
                logger.warning("Hatırlatma gönderilemedi (%s): %s", due.source_type.value, error)
            self._record(due, error)
            if error is None:
                sent += 1
            else:
                failed += 1
        return ReminderRunResult(sent=sent, failed=failed)

    # ----- candidates -----

    def _event_candidates(self, today: date, last_day: date) -> list[_Candidate]:
        rows = (
            self.db.query(CalendarEvent, Case.case_name)
            .outerjoin(Case, CalendarEvent.case_id == Case.id)
            .filter(
                CalendarEvent.starts_at >= datetime.combine(today, time.min),
                CalendarEvent.starts_at < datetime.combine(last_day + timedelta(days=1), time.min),
            )
            .all()
        )
        return [
            _Candidate(
                source_type=ReminderSourceType.EVENT,
                source_id=event.id,
                law_firm_id=event.law_firm_id,
                occurrence_date=event.starts_at.date(),
                reminder_days=list(event.reminder_days or []),
                recipient_id=event.assignee_id or event.created_by,
                type_label=TYPE_LABELS[CalendarEventType(event.event_type).value],
                title=event.title,
                starts_at=None if event.all_day else event.starts_at,
                location=event.location,
                case_id=event.case_id,
                case_name=case_name,
            )
            for event, case_name in rows
        ]

    def _task_candidates(self, today: date, last_day: date) -> list[_Candidate]:
        rows = (
            self.db.query(Task, Case.case_name)
            .join(Case, Task.case_id == Case.id)
            .filter(Task.status == TaskStatus.PENDING, Task.due_date >= today, Task.due_date <= last_day)
            .all()
        )
        return [
            _Candidate(
                source_type=ReminderSourceType.TASK,
                source_id=task.id,
                law_firm_id=task.law_firm_id,
                occurrence_date=task.due_date,
                reminder_days=task_reminder_days(task.reminder_days),
                recipient_id=task.assigned_to or task.created_by,
                type_label=TYPE_LABELS["task"],
                title=task.title,
                starts_at=None,
                location=None,
                case_id=task.case_id,
                case_name=case_name,
            )
            for task, case_name in rows
        ]

    def _hearing_candidates(self, today: date, last_day: date) -> list[_Candidate]:
        hearing_event_days = {
            (case_id, starts_at.date())
            for case_id, starts_at in self.db.query(CalendarEvent.case_id, CalendarEvent.starts_at)
            .filter(
                CalendarEvent.event_type == CalendarEventType.HEARING,
                CalendarEvent.case_id.isnot(None),
                CalendarEvent.starts_at >= datetime.combine(today, time.min),
                CalendarEvent.starts_at < datetime.combine(last_day + timedelta(days=1), time.min),
            )
            .all()
        }
        cases = (
            self.db.query(Case)
            .filter(
                Case.is_archived.is_(False),
                Case.next_hearing_date >= today,
                Case.next_hearing_date <= last_day,
            )
            .all()
        )
        return [
            _Candidate(
                source_type=ReminderSourceType.CASE_HEARING,
                source_id=case.id,
                law_firm_id=case.law_firm_id,
                occurrence_date=case.next_hearing_date,
                reminder_days=list(HEARING_REMINDER_DAYS),
                recipient_id=case.assigned_lawyer_id,
                type_label=TYPE_LABELS["hearing"],
                title=case.case_name,
                starts_at=None,
                location=case.court,
                case_id=case.id,
                case_name=case.case_name,
            )
            for case in cases
            if (case.id, case.next_hearing_date) not in hearing_event_days
        ]

    # ----- deliveries -----

    def _users(self, user_ids: set[str]) -> dict[str, User]:
        if not user_ids:
            return {}
        return {user.id: user for user in self.db.query(User).filter(User.id.in_(user_ids)).all()}

    def _deliveries(self, source_type, source_id, occurrence_date, recipient_id) -> dict[int, ReminderDelivery]:
        rows = (
            self.db.query(ReminderDelivery)
            .filter(
                ReminderDelivery.source_type == source_type,
                ReminderDelivery.source_id == source_id,
                ReminderDelivery.occurrence_date == occurrence_date,
                ReminderDelivery.recipient_user_id == recipient_id,
            )
            .all()
        )
        return {row.days_before: row for row in rows}

    def _pending_offsets(self, candidate: _Candidate, recipient_id: str, offsets: list[int]) -> list[int]:
        if not offsets:
            return []
        existing = self._deliveries(
            candidate.source_type, candidate.source_id, candidate.occurrence_date, recipient_id
        )
        return [
            days_before
            for days_before in offsets
            if days_before not in existing
            or (
                existing[days_before].status == ReminderDeliveryStatus.FAILED
                and existing[days_before].attempts < settings.reminder_max_attempts
            )
        ]

    def _record(self, due: DueReminder, error: Optional[str]) -> None:
        existing = self._deliveries(due.source_type, due.source_id, due.occurrence_date, due.recipient_id)
        for days_before in due.days_before:
            row = existing.get(days_before)
            if row is None:
                row = ReminderDelivery(
                    law_firm_id=due.law_firm_id,
                    source_type=due.source_type,
                    source_id=due.source_id,
                    occurrence_date=due.occurrence_date,
                    days_before=days_before,
                    recipient_user_id=due.recipient_id,
                    attempts=0,
                )
                self.db.add(row)
            row.attempts += 1
            if error is None:
                row.status = ReminderDeliveryStatus.SENT
                row.last_error = None
                row.sent_at = datetime.now(timezone.utc)
            else:
                row.status = ReminderDeliveryStatus.FAILED
                row.last_error = error[:300]
        self.db.commit()
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_reminder_service.py tests/unit/test_notification_content.py tests/integration/test_calendar_migration.py tests/api/test_notifications.py -q`
Expected: 40 passed.

- [ ] **Step: Commit**

```bash
git add backend/app/models/calendar.py backend/app/models/__init__.py backend/alembic/versions/f3b5d7e9a1c2_add_reminder_deliveries.py backend/app/services/notification_content.py backend/app/services/reminder_service.py backend/tests/unit/test_reminder_service.py backend/tests/unit/test_notification_content.py backend/tests/integration/test_calendar_migration.py
git commit -F - <<'EOF'
feat(reminders): reminder service with delivery ledger, catch-up and retries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 5: Reminder worker, startup wiring, Mailpit and `.env.example`

**Files:**
- Create: `backend/app/services/reminder_worker.py`
- Modify: `backend/app/main.py`, `docker-compose.yml`, `.env.example`, `backend/Dockerfile`
- Test: `backend/tests/unit/test_reminder_worker.py` (new)

**Interfaces:**
- Consumes: `ReminderService`, `ReminderRunResult` (Task 4); `local_now` (Task 2); `settings.reminders_enabled`, `settings.reminder_poll_seconds` (Task 1).
- Produces: `should_start_reminder_worker() -> bool` (`settings.env != "test" and settings.reminders_enabled`), `run_reminder_tick(session_factory=SessionLocal, now_local: Optional[datetime] = None) -> ReminderRunResult`, `run_reminder_worker_loop(poll_interval_seconds, stop_event=None, session_factory=SessionLocal)`, `start_reminder_worker_thread(poll_interval_seconds: Optional[float] = None) -> threading.Event`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_reminder_worker.py`:

```python
"""Reminder worker: start condition, one tick, loop resilience."""
import threading
from datetime import datetime

from app.core.config import settings
from app.services import reminder_worker
from app.services.reminder_worker import run_reminder_tick, run_reminder_worker_loop, should_start_reminder_worker


def test_worker_never_starts_in_tests():
    assert settings.env == "test"
    assert should_start_reminder_worker() is False


def test_worker_starts_outside_tests_unless_disabled(monkeypatch):
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "reminders_enabled", True)
    assert should_start_reminder_worker() is True
    monkeypatch.setattr(settings, "reminders_enabled", False)
    assert should_start_reminder_worker() is False


def test_app_startup_in_tests_does_not_start_the_reminder_thread(monkeypatch):
    def boom(*args, **kwargs):  # pragma: no cover - must not be called
        raise AssertionError("reminder worker started during tests")

    monkeypatch.setattr("app.main.start_reminder_worker_thread", boom)
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as again:
        assert again.get("/health").status_code == 200


def test_tick_sends_due_reminders_with_the_given_local_time(db_session, monkeypatch):
    from app.models.calendar import CalendarEvent, CalendarEventType, ReminderDelivery
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="avukat@a.test", hashed_password="x", full_name="Avukat",
                role=UserRole.LAWYER, is_active=True)
    db_session.add(user)
    db_session.flush()
    db_session.add(CalendarEvent(law_firm_id=firm.id, title="Toplantı", event_type=CalendarEventType.MEETING,
                                 starts_at=datetime(2026, 10, 3, 10, 0), all_day=False, duration_minutes=60,
                                 created_by=user.id, reminder_days=[1]))
    db_session.commit()
    sent = []
    monkeypatch.setattr("app.services.reminder_service.send_email", sent.append)

    early = run_reminder_tick(lambda: db_session, now_local=datetime(2026, 10, 2, 8, 0))
    result = run_reminder_tick(lambda: db_session, now_local=datetime(2026, 10, 2, 9, 15))

    assert (early.sent, result.sent, result.failed) == (0, 1, 0)
    assert [m.to for m in sent] == ["avukat@a.test"]
    assert db_session.query(ReminderDelivery).count() == 1


def test_loop_survives_a_failing_tick_and_stops_on_the_event(monkeypatch):
    stop = threading.Event()
    calls = []

    def tick(session_factory):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database hiccup")
        stop.set()

    monkeypatch.setattr(reminder_worker, "run_reminder_tick", tick)

    run_reminder_worker_loop(0.001, stop_event=stop)

    assert len(calls) == 2
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_reminder_worker.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.reminder_worker'`.

- [ ] **Step 3: Implement**

Create `backend/app/services/reminder_worker.py`:

```python
"""In-process reminder worker.

Like the simulation and courtroom workers: one daemon thread in the API
process that runs ReminderService.send_due every REMINDER_POLL_SECONDS
with its own DB session per tick. "Now" is computed in APP_TIMEZONE.
Not started during automated tests (settings.env == "test") or when
REMINDERS_ENABLED=false. Single-instance only: two API processes would
each run a worker, and the unique constraint on reminder_deliveries is
then the only guard against a duplicate e-mail.
"""
import logging
import threading
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import local_now
from app.db.session import SessionLocal
from app.services.reminder_service import ReminderRunResult, ReminderService

logger = logging.getLogger("casebridge")


def should_start_reminder_worker() -> bool:
    return settings.env != "test" and settings.reminders_enabled


def run_reminder_tick(
    session_factory: Callable[[], Session] = SessionLocal,
    now_local: Optional[datetime] = None,
) -> ReminderRunResult:
    db = session_factory()
    try:
        result = ReminderService(db).send_due(now_local or local_now())
    finally:
        db.close()
    if result.sent or result.failed:
        logger.info("Hatırlatmalar: %d gönderildi, %d başarısız.", result.sent, result.failed)
    return result


def run_reminder_worker_loop(
    poll_interval_seconds: float,
    stop_event: Optional[threading.Event] = None,
    session_factory: Callable[[], Session] = SessionLocal,
) -> None:
    stop_event = stop_event or threading.Event()
    while not stop_event.is_set():
        try:
            run_reminder_tick(session_factory)
        except Exception:
            logger.exception("Reminder worker tick failed")
        stop_event.wait(poll_interval_seconds)


def start_reminder_worker_thread(poll_interval_seconds: Optional[float] = None) -> threading.Event:
    stop_event = threading.Event()
    thread = threading.Thread(
        target=run_reminder_worker_loop,
        args=(poll_interval_seconds or settings.reminder_poll_seconds, stop_event),
        daemon=True,
        name="casebridge-reminder-worker",
    )
    thread.start()
    return stop_event
```

In `backend/app/main.py`:

```python
# imports, after the courtroom worker import
from app.services.reminder_worker import should_start_reminder_worker, start_reminder_worker_thread

# in lifespan(), right after the `if settings.env != "test":` block that starts the other workers
    # E-mail reminders: same rule as the workers above (never in tests),
    # and REMINDERS_ENABLED=false turns it off.
    reminder_stop_event = None
    if should_start_reminder_worker():
        reminder_stop_event = start_reminder_worker_thread()
        logger.info("Reminder worker thread started.")

    yield

# after the courtroom stop
    if reminder_stop_event is not None:
        reminder_stop_event.set()
```

`docker-compose.yml` — additive only (the user has local, uncommitted port-parametrization edits; touch nothing else). Add four lines under `backend.environment` after `OLLAMA_BASE_URL`, and a new `mailpit` service before the top-level `volumes:`:

Apply to `docker-compose.yml`:

```diff
diff --git a/docker-compose.yml b/docker-compose.yml
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -27,6 +27,10 @@ services:
     environment:
       DATABASE_URL: postgresql://casebridge:casebridge@db:5432/casebridge
       OLLAMA_BASE_URL: http://host.docker.internal:11434
+      EMAIL_BACKEND: ${EMAIL_BACKEND:-smtp}
+      SMTP_HOST: ${SMTP_HOST:-mailpit}
+      SMTP_PORT: ${SMTP_PORT:-1025}
+      SMTP_USE_TLS: ${SMTP_USE_TLS:-false}
     extra_hosts:
       - "host.docker.internal:host-gateway"
     depends_on:
@@ -49,6 +53,13 @@ services:
     ports:
       - "3000:3000"
 
+  mailpit:
+    image: axllent/mailpit
+    restart: unless-stopped
+    ports:
+      - "${MAILPIT_UI_PORT:-8025}:8025"
+      - "${MAILPIT_SMTP_PORT:-1025}:1025"
+
 volumes:
   casebridge_pgdata:
   casebridge_storage:
```

Compose's `environment:` wins over `env_file`; the `${VAR:-default}` values are read from the shell or the project `.env`, so real SMTP values in `.env` take effect, and empty/unset values fall back to Mailpit.

Apply to `.env.example`:

```diff
diff --git a/.env.example b/.env.example
--- a/.env.example
+++ b/.env.example
@@ -62,6 +62,31 @@ CHAT_AUTO_LEVEL=true
 # message reloads models and the classifier may time out.
 CHAT_CLASSIFIER_TIMEOUT_SECONDS=8
 
+# E-mail (calendar reminders and the test e-mail in Ayarlar).
+# EMAIL_BACKEND: console (default; only logs recipient + subject) | smtp.
+# Docker Compose already sends to the bundled Mailpit
+# (http://localhost:8025). Uncomment and fill these only for a real
+# SMTP server; empty/commented values keep the defaults.
+# EMAIL_BACKEND=smtp
+# SMTP_HOST=smtp.example.com
+# SMTP_PORT=587
+# SMTP_USERNAME=
+# SMTP_PASSWORD=
+# SMTP_USE_TLS=true
+# SMTP_FROM=CaseBridge <no-reply@casebridge.local>
+# SMTP_TIMEOUT_SECONDS=10
+
+# Calendar reminders. Event times are local times in APP_TIMEZONE.
+# Reminders go out from REMINDER_SEND_HOUR (0-23) on; the worker checks
+# every REMINDER_POLL_SECONDS and retries a failed e-mail up to
+# REMINDER_MAX_ATTEMPTS times. APP_BASE_URL is used for links in e-mails.
+APP_TIMEZONE=Europe/Istanbul
+APP_BASE_URL=http://localhost:3000
+REMINDERS_ENABLED=true
+REMINDER_SEND_HOUR=9
+REMINDER_POLL_SECONDS=900
+REMINDER_MAX_ATTEMPTS=3
+
 DATABASE_URL=sqlite:///./casebridge.db
 JWT_SECRET=change-me-in-dev
 JWT_ALGORITHM=HS256
```

The e-mail lines stay commented so a `.env` copied from the example does not override the Compose Mailpit defaults.

`backend/Dockerfile` — make sure `zoneinfo` has `Europe/Istanbul` in the slim image (an OS package, not a Python package):

Apply to `backend/Dockerfile`:

```diff
diff --git a/backend/Dockerfile b/backend/Dockerfile
--- a/backend/Dockerfile
+++ b/backend/Dockerfile
@@ -3,7 +3,7 @@ FROM python:3.11-slim AS base
 # psycopg2-binary needs libpq at runtime; build tools only needed if a
 # future dependency requires compiling (kept minimal on purpose).
 RUN apt-get update && apt-get install -y --no-install-recommends \
-    libpq-dev gcc \
+    libpq-dev gcc tzdata \
     && rm -rf /var/lib/apt/lists/*
 
 WORKDIR /app
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_reminder_worker.py -q && pytest -q`
Expected: 5 passed; full suite ≈ 430 passed.

Run: `docker compose config --quiet && echo ok` (only if Docker is installed; otherwise skip and say so in the report).
Expected: `ok`.

- [ ] **Step: Commit**

```bash
git add backend/app/services/reminder_worker.py backend/app/main.py docker-compose.yml .env.example backend/Dockerfile backend/tests/unit/test_reminder_worker.py
git commit -F - <<'EOF'
feat(reminders): background reminder worker and Mailpit for local e-mail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 6: Frontend types, API client, URL state and calendar helpers

**Files:**
- Modify: `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/filters.ts`, `frontend/src/components/CalendarView.tsx` (minimal, keeps it compiling and working until Task 9)
- Create: `frontend/src/lib/calendar.ts`
- Test: `frontend/src/lib/__tests__/calendar.test.ts` (new), `frontend/src/lib/__tests__/filters.test.ts`, `frontend/src/lib/__tests__/api.test.ts`

**Interfaces:**
- Consumes: backend API from Tasks 1–3.
- Produces:
  - Types: `CalendarEventType`, `CalendarItemKind`, `CalendarEvent` (the `GET /calendar` row; `case_id`/`case_name` now nullable), `CalendarEventRecord`, `CalendarEventPayload`, `EmailBackend`, `NotificationStatus`, `TestEmailResult`; `Task.reminder_days?: number[] | null`.
  - API: `getCalendarEvents(range?: {from, to})`, `createCalendarEvent(payload)`, `updateCalendarEvent(id, Partial<payload>)`, `deleteCalendarEvent(id)`, `updateTaskReminders(taskId, number[] | null)`, `getNotificationStatus()`, `sendTestEmail()`.
  - `lib/filters.ts`: `toDateKey(date)`, `CALENDAR_VIEWS`, `CalendarViewSlug`, `CALENDAR_TYPE_SLUGS` (`durusma|toplanti|muvekkil|diger|gorev`), `CalendarTypeSlug`, `CALENDAR_FILTER_KEYS`, `CalendarQuery {gorunum?: "hafta"|"ajanda"; ay?; hafta?; tur?; sorumlu?; dava?; benim?: "1"}`, `parseCalendarQuery` (maps legacy `goster` → `tur`).
  - `lib/calendar.ts`: `MONTH_NAMES`, `WEEKDAYS`, `WEEKDAY_NAMES`, `EVENT_TYPE_LABELS`, `EVENT_TYPE_OPTIONS`, `TYPE_SLUG_TO_EVENT_TYPE`, `DEFAULT_REMINDER_DAYS`, `REMINDER_OPTIONS = [0, 1, 3, 7]`, `reminderDayLabel`, `describeReminders`, `parseDateKey`, `toDateKey`, `addDays`, `startOfWeek`, `monthKey`, `monthFromKey`, `formatDayLong`, `DateRange`, `AGENDA_DAYS = 30`, `monthRange`, `weekRange`, `agendaRange`, `isTimed`, `timeLabel`, `durationMinutes`, `DAY_START_HOUR = 8`, `DAY_END_HOUR = 20`, `HOUR_HEIGHT = 48`, `timedBlock(item) -> {top, height}`, `groupByDate`, `filterCalendarItems(items, query, meId)`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  addDays,
  agendaRange,
  describeReminders,
  durationMinutes,
  filterCalendarItems,
  formatDayLong,
  groupByDate,
  isTimed,
  monthRange,
  startOfWeek,
  timedBlock,
  timeLabel,
  toDateKey,
  weekRange,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/types";

function item(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event:e1",
    kind: "event",
    event_type: "meeting",
    title: "Müvekkil toplantısı",
    date: "2026-10-07",
    start: "2026-10-07T14:30:00",
    end: "2026-10-07T16:00:00",
    all_day: false,
    case_id: null,
    case_name: null,
    task_id: null,
    event_id: "e1",
    assignee_id: null,
    assignee_name: null,
    location: null,
    notes: null,
    reminder_days: [1],
    editable: true,
    ...overrides,
  };
}

describe("calendar dates and ranges", () => {
  it("finds the Monday of a week and adds days across months", () => {
    expect(toDateKey(startOfWeek(new Date(2026, 9, 2)))).toBe("2026-09-28"); // Friday -> Monday
    expect(toDateKey(startOfWeek(new Date(2026, 9, 4)))).toBe("2026-09-28"); // Sunday -> Monday
    expect(toDateKey(startOfWeek(new Date(2026, 9, 5)))).toBe("2026-10-05"); // Monday stays
    expect(toDateKey(addDays(new Date(2026, 9, 30), 3))).toBe("2026-11-02");
  });

  it("builds the fetch range of each view", () => {
    expect(monthRange(new Date(2026, 1, 1))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(weekRange(new Date(2026, 9, 5))).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(agendaRange(new Date(2026, 9, 2))).toEqual({ from: "2026-10-02", to: "2026-10-31" });
  });

  it("formats a day in Turkish", () => {
    expect(formatDayLong("2026-10-07")).toBe("7 Ekim 2026 Çarşamba");
  });
});

describe("calendar items", () => {
  it("reads times and durations from naive ISO strings", () => {
    expect(timeLabel("2026-10-07T14:30:00")).toBe("14:30");
    expect(durationMinutes(item())).toBe(90);
    expect(durationMinutes(item({ start: null, end: null, all_day: true }))).toBe(60);
    expect(isTimed(item())).toBe(true);
    expect(isTimed(item({ all_day: true, start: null, end: null }))).toBe(false);
  });

  it("places timed items in the 08:00-20:00 grid at 48px per hour", () => {
    expect(timedBlock(item())).toEqual({ top: 312, height: 72 });
    expect(timedBlock(item({ start: "2026-10-07T07:00:00", end: "2026-10-07T09:00:00" }))).toEqual({ top: 0, height: 48 });
    expect(timedBlock(item({ start: "2026-10-07T21:00:00", end: "2026-10-07T22:00:00" }))).toEqual({ top: 564, height: 12 });
  });

  it("groups items by day keeping their order", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b", date: "2026-10-08" });
    const c = item({ id: "c" });
    expect(groupByDate([a, b, c])).toEqual({ "2026-10-07": [a, c], "2026-10-08": [b] });
  });

  it("filters by type, assignee, case and 'only mine'", () => {
    const hearing = item({ id: "h", kind: "case_hearing", event_type: "hearing", case_id: "c1", assignee_id: "u1" });
    const task = item({ id: "t", kind: "task", event_type: "task", case_id: "c2", assignee_id: "u2" });
    const meeting = item({ id: "m", assignee_id: null });
    const all = [hearing, task, meeting];
    const ids = (list: CalendarEvent[]) => list.map((i) => i.id);

    expect(ids(filterCalendarItems(all, {}, "u1"))).toEqual(["h", "t", "m"]);
    expect(ids(filterCalendarItems(all, { tur: "durusma" }, null))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { tur: "gorev" }, null))).toEqual(["t"]);
    expect(ids(filterCalendarItems(all, { sorumlu: "u2" }, null))).toEqual(["t"]);
    expect(ids(filterCalendarItems(all, { dava: "c1" }, null))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { benim: "1" }, "u1"))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { benim: "1" }, null))).toEqual([]);
  });

  it("describes reminder choices in Turkish", () => {
    expect(describeReminders([])).toBe("Hatırlatma yok");
    expect(describeReminders([0, 3, 1])).toBe("3 gün önce, 1 gün önce, Aynı gün");
  });
});
```

Apply to `frontend/src/lib/__tests__/filters.test.ts`:

```diff
diff --git a/frontend/src/lib/__tests__/filters.test.ts b/frontend/src/lib/__tests__/filters.test.ts
--- a/frontend/src/lib/__tests__/filters.test.ts
+++ b/frontend/src/lib/__tests__/filters.test.ts
@@ -122,11 +122,19 @@ describe("document list query", () => {
 });
 
 describe("calendar, tabs and dates", () => {
-  it("accepts only valid YYYY-MM months", () => {
-    expect(parseCalendarQuery(new URLSearchParams("ay=2026-10&goster=gorev"))).toEqual({ ay: "2026-10", goster: "gorev" });
+  it("accepts only valid YYYY-MM months and maps the legacy goster param to tur", () => {
+    expect(parseCalendarQuery(new URLSearchParams("ay=2026-10&goster=gorev"))).toEqual({ ay: "2026-10", tur: "gorev" });
     expect(parseCalendarQuery(new URLSearchParams("ay=2026-13&goster=x"))).toEqual({});
   });
 
+  it("parses the calendar view, week and filters", () => {
+    expect(
+      parseCalendarQuery(new URLSearchParams("gorunum=hafta&hafta=2026-10-05&tur=muvekkil&sorumlu=u1&dava=c1&benim=1")),
+    ).toEqual({ gorunum: "hafta", hafta: "2026-10-05", tur: "muvekkil", sorumlu: "u1", dava: "c1", benim: "1" });
+    expect(parseCalendarQuery(new URLSearchParams("gorunum=ay&tur=durusma&goster=gorev"))).toEqual({ tur: "durusma" });
+    expect(parseCalendarQuery(new URLSearchParams("gorunum=yil&hafta=2026-02-30&tur=x&benim=evet"))).toEqual({});
+  });
+
   it("builds case detail links and parses tab slugs", () => {
     expect(caseDetailHref("c1")).toBe("/davalar/c1");
     expect(caseDetailHref("c1", "genel")).toBe("/davalar/c1");
```

Apply to `frontend/src/lib/__tests__/api.test.ts`:

```diff
diff --git a/frontend/src/lib/__tests__/api.test.ts b/frontend/src/lib/__tests__/api.test.ts
--- a/frontend/src/lib/__tests__/api.test.ts
+++ b/frontend/src/lib/__tests__/api.test.ts
@@ -102,4 +102,51 @@ describe("chat API", () => {
     expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ title: "Yeni ad" });
     expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ value: -1 });
   });
+
+  it("sends the calendar range and calls the calendar event, task reminder and notification endpoints", async () => {
+    window.localStorage.setItem("casebridge_token", "valid-token");
+    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
+    global.fetch = fetchMock as unknown as typeof fetch;
+    const api = await import("@/lib/api");
+    const payload = {
+      title: "Toplantı",
+      event_type: "meeting" as const,
+      starts_at: "2026-10-07T14:30:00",
+      all_day: false,
+      duration_minutes: 60,
+      location: null,
+      notes: null,
+      case_id: null,
+      assignee_id: null,
+      reminder_days: [1],
+    };
+
+    await api.getCalendarEvents({ from: "2026-10-01", to: "2026-10-31" });
+    await api.createCalendarEvent(payload);
+    await api.updateCalendarEvent("e1", { reminder_days: [] });
+    await api.updateTaskReminders("t1", [3, 1]);
+    await api.getNotificationStatus();
+    await api.sendTestEmail();
+
+    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body ?? null]);
+    expect(calls).toEqual([
+      ["http://localhost:8000/calendar?from=2026-10-01&to=2026-10-31", "GET", null],
+      ["http://localhost:8000/calendar/events", "POST", JSON.stringify(payload)],
+      ["http://localhost:8000/calendar/events/e1", "PATCH", JSON.stringify({ reminder_days: [] })],
+      ["http://localhost:8000/tasks/t1", "PATCH", JSON.stringify({ reminder_days: [3, 1] })],
+      ["http://localhost:8000/notifications/status", "GET", null],
+      ["http://localhost:8000/notifications/test-email", "POST", null],
+    ]);
+  });
+
+  it("deleteCalendarEvent accepts a 204 response", async () => {
+    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error("no body"); } });
+    global.fetch = fetchMock as unknown as typeof fetch;
+    const { deleteCalendarEvent } = await import("@/lib/api");
+
+    await expect(deleteCalendarEvent("e1")).resolves.toBeUndefined();
+    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/calendar/events/e1");
+    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
+  });
 });
+
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib`
Expected: FAIL — `Failed to resolve import "@/lib/calendar"`, `parseCalendarQuery` returns `{ goster: "gorev" }`, `api.createCalendarEvent is not a function`.

- [ ] **Step 3: Implement**

Apply to `frontend/src/types/index.ts`:

```diff
diff --git a/frontend/src/types/index.ts b/frontend/src/types/index.ts
--- a/frontend/src/types/index.ts
+++ b/frontend/src/types/index.ts
@@ -48,6 +48,8 @@ export interface Task {
   assigned_to: string | null;
   created_at: string;
   completed_at: string | null;
+  /** null/absent -> default reminder 1 day before; [] -> no reminders. */
+  reminder_days?: number[] | null;
 }
 
 export interface TaskWithCase extends Task {
@@ -65,13 +67,74 @@ export interface ActivityItem {
   created_at: string;
 }
 
+export type CalendarEventType = "hearing" | "meeting" | "client_meeting" | "other";
+export type CalendarItemKind = "event" | "task" | "case_hearing";
+
+/** One row of GET /calendar: a calendar event, a pending task's due date or a case hearing. */
 export interface CalendarEvent {
-  event_type: "hearing" | "task";
-  date: string;
+  id: string; // "event:<id>" | "task:<id>" | "hearing:<case_id>"
+  kind: CalendarItemKind;
+  event_type: CalendarEventType | "task";
   title: string;
-  case_id: string;
-  case_name: string;
+  date: string; // YYYY-MM-DD
+  start: string | null; // naive local ISO datetime, timed events only
+  end: string | null;
+  all_day: boolean;
+  case_id: string | null;
+  case_name: string | null;
   task_id: string | null;
+  event_id: string | null;
+  assignee_id: string | null;
+  assignee_name: string | null;
+  location: string | null;
+  notes: string | null;
+  reminder_days: number[];
+  editable: boolean;
+}
+
+/** A stored calendar event (POST/GET/PATCH /calendar/events). */
+export interface CalendarEventRecord {
+  id: string;
+  title: string;
+  event_type: CalendarEventType;
+  starts_at: string;
+  all_day: boolean;
+  duration_minutes: number;
+  location: string | null;
+  notes: string | null;
+  case_id: string | null;
+  assignee_id: string | null;
+  created_by: string;
+  reminder_days: number[];
+  created_at: string;
+  updated_at: string;
+}
+
+export interface CalendarEventPayload {
+  title: string;
+  event_type: CalendarEventType;
+  starts_at: string; // "YYYY-MM-DDTHH:MM:00", local time
+  all_day: boolean;
+  duration_minutes: number;
+  location: string | null;
+  notes: string | null;
+  case_id: string | null;
+  assignee_id: string | null;
+  reminder_days: number[];
+}
+
+export type EmailBackend = "console" | "smtp";
+
+export interface NotificationStatus {
+  email_backend: EmailBackend;
+  reminders_enabled: boolean;
+  reminder_send_hour: number;
+  timezone: string;
+}
+
+export interface TestEmailResult {
+  sent: boolean;
+  backend: EmailBackend;
 }
 
 export type UserRole = "admin" | "lawyer";
```

Apply to `frontend/src/lib/api.ts`:

```diff
diff --git a/frontend/src/lib/api.ts b/frontend/src/lib/api.ts
--- a/frontend/src/lib/api.ts
+++ b/frontend/src/lib/api.ts
@@ -18,6 +18,10 @@ import type {
   SimulationWithCase,
   ActivityItem,
   CalendarEvent,
+  CalendarEventPayload,
+  CalendarEventRecord,
+  NotificationStatus,
+  TestEmailResult,
   AIStatus,
   AppUser,
   DocumentWithCase,
@@ -275,8 +279,37 @@ export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
   return request(`/activity?limit=${limit}`);
 }
 
-export async function getCalendarEvents(): Promise<CalendarEvent[]> {
-  return request(`/calendar`);
+export async function getCalendarEvents(range?: { from: string; to: string }): Promise<CalendarEvent[]> {
+  const query = range ? `?${new URLSearchParams({ from: range.from, to: range.to }).toString()}` : "";
+  return request(`/calendar${query}`);
+}
+
+export async function createCalendarEvent(payload: CalendarEventPayload): Promise<CalendarEventRecord> {
+  return request("/calendar/events", { method: "POST", body: JSON.stringify(payload) });
+}
+
+export async function updateCalendarEvent(
+  id: string,
+  payload: Partial<CalendarEventPayload>,
+): Promise<CalendarEventRecord> {
+  return request(`/calendar/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
+}
+
+export async function deleteCalendarEvent(id: string): Promise<void> {
+  return request(`/calendar/events/${id}`, { method: "DELETE" });
+}
+
+/** null resets the task to the default reminder (1 day before). */
+export async function updateTaskReminders(taskId: string, reminderDays: number[] | null): Promise<Task> {
+  return request(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ reminder_days: reminderDays }) });
+}
+
+export async function getNotificationStatus(): Promise<NotificationStatus> {
+  return request("/notifications/status");
+}
+
+export async function sendTestEmail(): Promise<TestEmailResult> {
+  return request("/notifications/test-email", { method: "POST" });
 }
 
 async function fetchBlob(path: string, errorPrefix: string): Promise<Blob> {
```

Apply to `frontend/src/lib/filters.ts`:

```diff
diff --git a/frontend/src/lib/filters.ts b/frontend/src/lib/filters.ts
--- a/frontend/src/lib/filters.ts
+++ b/frontend/src/lib/filters.ts
@@ -56,6 +56,11 @@ export function parseDateOnly(value: string): Date {
   return new Date(year, month - 1, day);
 }
 
+/** Local date -> "YYYY-MM-DD". */
+export function toDateKey(date: Date): string {
+  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
+}
+
 function startOfDay(date: Date): Date {
   return new Date(date.getFullYear(), date.getMonth(), date.getDate());
 }
@@ -239,16 +244,40 @@ export function describeDocumentListQuery(query: DocumentListQuery, caseLabel: (
 
 // ---------- Calendar (/takvim) ----------
 
+export const CALENDAR_VIEWS = ["ay", "hafta", "ajanda"] as const;
+export type CalendarViewSlug = (typeof CALENDAR_VIEWS)[number];
+export const CALENDAR_TYPE_SLUGS = ["durusma", "toplanti", "muvekkil", "diger", "gorev"] as const;
+export type CalendarTypeSlug = (typeof CALENDAR_TYPE_SLUGS)[number];
+/** URL keys of the calendar filters (cleared together by "Filtreleri temizle"). */
+export const CALENDAR_FILTER_KEYS = ["tur", "sorumlu", "dava", "benim"] as const;
+
 export interface CalendarQuery {
+  gorunum?: Exclude<CalendarViewSlug, "ay">; // absent = month view
   ay?: string; // YYYY-MM
-  goster?: "durusma" | "gorev";
+  hafta?: string; // YYYY-MM-DD (any day; the view starts on its Monday)
+  tur?: CalendarTypeSlug;
+  sorumlu?: string; // user id
+  dava?: string; // case id
+  benim?: "1";
+}
+
+function validDateKey(value: string | null): string | undefined {
+  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
+  return toDateKey(parseDateOnly(value)) === value ? value : undefined;
 }
 
 export function parseCalendarQuery(params: ParamSource): CalendarQuery {
   const ay = params.get("ay");
+  const gorunum = pick(params.get("gorunum"), CALENDAR_VIEWS);
   return compact({
+    gorunum: gorunum === "ay" ? undefined : gorunum,
     ay: ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay) ? ay : undefined,
-    goster: pick(params.get("goster"), ["durusma", "gorev"] as const),
+    hafta: validDateKey(params.get("hafta")),
+    // Legacy ?goster=durusma|gorev links keep working.
+    tur: pick(params.get("tur"), CALENDAR_TYPE_SLUGS) ?? pick(params.get("goster"), ["durusma", "gorev"] as const),
+    sorumlu: params.get("sorumlu") || undefined,
+    dava: params.get("dava") || undefined,
+    benim: pick(params.get("benim"), ["1"] as const),
   });
 }
```

Create `frontend/src/lib/calendar.ts`:

```ts
/**
 * Calendar helpers: local-date arithmetic, fetch ranges per view, week-grid
 * geometry, filtering and Turkish labels. Dates are "YYYY-MM-DD" strings in
 * local time; item start/end are naive local ISO datetimes from the API.
 */
import { parseDateOnly, toDateKey, type CalendarQuery, type CalendarTypeSlug } from "@/lib/filters";
import type { CalendarEvent, CalendarEventType } from "@/types";

export { toDateKey };

export const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const WEEKDAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export const EVENT_TYPE_LABELS: Record<CalendarEvent["event_type"], string> = {
  hearing: "Duruşma",
  meeting: "Toplantı",
  client_meeting: "Müvekkil görüşmesi",
  other: "Diğer",
  task: "Görev",
};
export const EVENT_TYPE_OPTIONS: CalendarEventType[] = ["hearing", "meeting", "client_meeting", "other"];
export const TYPE_SLUG_TO_EVENT_TYPE: Record<CalendarTypeSlug, CalendarEvent["event_type"]> = {
  durusma: "hearing",
  toplanti: "meeting",
  muvekkil: "client_meeting",
  diger: "other",
  gorev: "task",
};

/** Must match app/domain/calendar.py. */
export const DEFAULT_REMINDER_DAYS: Record<CalendarEventType, number[]> = {
  hearing: [3, 1],
  meeting: [1],
  client_meeting: [1],
  other: [1],
};
export const REMINDER_OPTIONS = [0, 1, 3, 7] as const;

export function reminderDayLabel(days: number): string {
  return days === 0 ? "Aynı gün" : `${days} gün önce`;
}

export function describeReminders(days: number[]): string {
  if (days.length === 0) return "Hatırlatma yok";
  return [...days].sort((a, b) => b - a).map(reminderDayLabel).join(", ");
}

// ---------- dates ----------

export const parseDateKey = parseDateOnly;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function monthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
}

export function monthFromKey(key: string | undefined): Date | null {
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function formatDayLong(key: string): string {
  const date = parseDateKey(key);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ${WEEKDAY_NAMES[(date.getDay() + 6) % 7]}`;
}

export interface DateRange {
  from: string;
  to: string;
}

export const AGENDA_DAYS = 30;

export function monthRange(month: Date): DateRange {
  return {
    from: toDateKey(new Date(month.getFullYear(), month.getMonth(), 1)),
    to: toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
  };
}

export function weekRange(weekStart: Date): DateRange {
  return { from: toDateKey(weekStart), to: toDateKey(addDays(weekStart, 6)) };
}

export function agendaRange(today: Date): DateRange {
  return { from: toDateKey(today), to: toDateKey(addDays(today, AGENDA_DAYS - 1)) };
}

// ---------- items ----------

export function isTimed(item: CalendarEvent): boolean {
  return !item.all_day && item.start !== null;
}

export function timeLabel(iso: string): string {
  return iso.slice(11, 16);
}

function minutesOfDay(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function durationMinutes(item: CalendarEvent): number {
  if (!item.start || !item.end) return 60;
  return Math.round((Date.parse(item.end) - Date.parse(item.start)) / 60_000);
}

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
export const HOUR_HEIGHT = 48; // px per hour in the week grid

/** Position of a timed item in the 08:00-20:00 week grid (clamped to the grid). */
export function timedBlock(item: CalendarEvent): { top: number; height: number } {
  const gridStart = DAY_START_HOUR * 60;
  const gridEnd = DAY_END_HOUR * 60;
  const start = minutesOfDay(item.start ?? "T00:00");
  const from = Math.min(Math.max(start, gridStart), gridEnd - 15);
  const to = Math.max(Math.min(start + durationMinutes(item), gridEnd), from + 15);
  return { top: ((from - gridStart) * HOUR_HEIGHT) / 60, height: ((to - from) * HOUR_HEIGHT) / 60 };
}

export function groupByDate(items: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return items.reduce<Record<string, CalendarEvent[]>>((acc, item) => {
    (acc[item.date] ??= []).push(item);
    return acc;
  }, {});
}

export function filterCalendarItems(items: CalendarEvent[], query: CalendarQuery, meId: string | null): CalendarEvent[] {
  const type = query.tur ? TYPE_SLUG_TO_EVENT_TYPE[query.tur] : undefined;
  return items.filter((item) => {
    if (type && item.event_type !== type) return false;
    if (query.sorumlu && item.assignee_id !== query.sorumlu) return false;
    if (query.dava && item.case_id !== query.dava) return false;
    if (query.benim && (!meId || item.assignee_id !== meId)) return false;
    return true;
  });
}
```

Keep the current `CalendarView.tsx` working with the new types (nullable `case_id`, `tur` instead of `goster`, month range fetch). Task 9 replaces this file:

```diff
--- a/frontend/src/components/CalendarView.tsx
+++ b/frontend/src/components/CalendarView.tsx
@@ -4,7 +4,8 @@
 import { useEffect, useMemo, useState } from "react";
 
 import { getCalendarEvents } from "@/lib/api";
-import { parseCalendarQuery, type CalendarQuery } from "@/lib/filters";
+import { monthRange } from "@/lib/calendar";
+import { parseCalendarQuery } from "@/lib/filters";
 import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
 import type { CalendarEvent } from "@/types";
 import { LoadingState } from "@/components/LoadingState";
@@ -36,6 +37,12 @@
   return new Date(now.getFullYear(), now.getMonth(), 1);
 }
 
+type LegacyShow = "durusma" | "gorev";
+
+function legacyShow(tur: string | undefined): LegacyShow | undefined {
+  return tur === "durusma" || tur === "gorev" ? tur : undefined;
+}
+
 export function CalendarView() {
   const { params, setParams } = useUrlParams();
   const quickViewHref = useQuickViewHref();
@@ -43,17 +50,17 @@
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [visibleMonth, setVisibleMonth] = useState(() => monthFromKey(parseCalendarQuery(params).ay) ?? currentMonthStart());
-  const [show, setShow] = useState<CalendarQuery["goster"]>(() => parseCalendarQuery(params).goster);
+  const [show, setShow] = useState<LegacyShow | undefined>(() => legacyShow(parseCalendarQuery(params).tur));
   const [openDay, setOpenDay] = useState<string | null>(null);
 
+  const range = monthRange(visibleMonth);
   useEffect(() => {
-    setLoading(true);
     setError(null);
-    getCalendarEvents()
+    getCalendarEvents({ from: range.from, to: range.to })
       .then(setEvents)
       .catch(() => setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin."))
       .finally(() => setLoading(false));
-  }, []);
+  }, [range.from, range.to]);
 
   const year = visibleMonth.getFullYear();
   const month = visibleMonth.getMonth();
@@ -103,13 +110,14 @@
     goToMonth(currentMonthStart(), null);
   }
 
-  function toggleShow(kind: NonNullable<CalendarQuery["goster"]>) {
+  function toggleShow(kind: LegacyShow) {
     const next = show === kind ? undefined : kind;
     setShow(next);
-    setParams({ goster: next ?? null });
+    setParams({ tur: next ?? null, goster: null });
   }
 
   function eventHref(event: CalendarEvent) {
+    if (!event.case_id) return "/takvim";
     return quickViewHref(event.case_id, event.task_id ? { type: "gorev", id: event.task_id } : undefined);
   }
 
@@ -120,7 +128,7 @@
         key={key}
         href={eventHref(event)}
         scroll={false}
-        title={`${event.title} — ${event.case_name}`}
+        title={[event.title, event.case_name].filter(Boolean).join(" — ")}
         className={`block rounded-md border-l-2 px-2 py-1.5 text-[11px] leading-4 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
           hearing ? "border-red-500 bg-red-50 text-red-800" : "border-accent-500 bg-accent-50 text-accent-800"
         }`}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib src/components/__tests__/CalendarView.test.tsx && npx tsc --noEmit`
Expected: all PASS (existing CalendarView tests unchanged and green), no type errors.

- [ ] **Step: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts frontend/src/lib/filters.ts frontend/src/lib/calendar.ts frontend/src/components/CalendarView.tsx frontend/src/lib/__tests__/calendar.test.ts frontend/src/lib/__tests__/filters.test.ts frontend/src/lib/__tests__/api.test.ts
git commit -F - <<'EOF'
feat(web): calendar types, API client, URL state and date helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 7: Month, week and agenda views and filters (presentational)

**Files:**
- Create: `frontend/src/components/calendar/CalendarItemButton.tsx`, `CalendarMonthView.tsx`, `CalendarWeekView.tsx`, `CalendarAgendaView.tsx`, `CalendarFilters.tsx`
- Test: `frontend/src/components/__tests__/CalendarViews.test.tsx` (new)

**Interfaces:**
- Consumes: Task 6 helpers/types.
- Produces:
  - `CalendarItemButton({ item, onSelect, className = "w-full", style })`, `TYPE_STYLES`, `TYPE_DOTS` (per `event_type`; colours red/accent/sky/emerald/navy-500).
  - `CalendarMonthView({ month: Date, items, todayKey, onSelect(item), onCreate(dateKey) })` — "+" button labelled `"<gün> <Ay> için etkinlik ekle"`; click on empty cell area also creates; "+n daha" popover (`dialog` "`<gün> <Ay> olayları`").
  - `CalendarWeekView({ weekStart: Date, items, todayKey, onSelect, onCreate(dateKey, time?) })` — all-day row (`data-testid="allday-<date>"`), hour grid 08:00–20:00 (`data-testid="day-<date>"`), slot buttons labelled `"<Pzt> <gün> <Ay> HH:00 için etkinlik ekle"`, timed chips absolutely positioned with `timedBlock`.
  - `CalendarAgendaView({ today: Date, items, onSelect })` — `list` "Ajanda", day headings (`h3`), "Bugün" and "Bu hafta" badges, empty text `Önümüzdeki 30 günde kayıt yok.`
  - `CalendarFilters({ query, users, cases, onChange(updates: Record<string, string | null>) })` — selects "Tür", "Sorumlu", "Dava", checkbox "Yalnızca benimkiler", button "Filtreleri temizle".

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/CalendarViews.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CalendarAgendaView } from "@/components/calendar/CalendarAgendaView";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import type { AppUser, CalendarEvent, Case } from "@/types";

function item(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event:e1",
    kind: "event",
    event_type: "meeting",
    title: "Müvekkil toplantısı",
    date: "2026-10-07",
    start: "2026-10-07T14:30:00",
    end: "2026-10-07T16:00:00",
    all_day: false,
    case_id: null,
    case_name: null,
    task_id: null,
    event_id: "e1",
    assignee_id: null,
    assignee_name: null,
    location: "Büro",
    notes: null,
    reminder_days: [1],
    editable: true,
    ...overrides,
  };
}

const task = item({
  id: "task:t1",
  kind: "task",
  event_type: "task",
  title: "Dilekçe hazırla",
  start: null,
  end: null,
  all_day: true,
  case_id: "c1",
  case_name: "Kira Davası",
  task_id: "t1",
  event_id: null,
  location: null,
});

describe("CalendarMonthView", () => {
  it("opens an item and creates on an empty day", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(
      <CalendarMonthView month={new Date(2026, 9, 1)} items={[item()]} todayKey="2026-10-02" onSelect={onSelect} onCreate={onCreate} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Müvekkil toplantısı/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "event:e1" }));

    await userEvent.click(screen.getByRole("button", { name: "12 Ekim için etkinlik ekle" }));
    expect(onCreate).toHaveBeenCalledWith("2026-10-12");
  });

  it("collapses busy days behind a '+n daha' popover", async () => {
    const busy = [1, 2, 3, 4, 5].map((n) => item({ id: `task:t${n}`, title: `Görev ${n}`, date: "2026-10-15", start: null, end: null, all_day: true }));
    render(<CalendarMonthView month={new Date(2026, 9, 1)} items={busy} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByText("Görev 4")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+2 daha" }));
    const popover = screen.getByRole("dialog", { name: "15 Ekim olayları" });
    expect(within(popover).getAllByRole("button", { name: /Görev/ })).toHaveLength(5);
  });
});

describe("CalendarWeekView", () => {
  it("puts untimed items in the all-day row and timed items in the hour grid", () => {
    render(
      <CalendarWeekView
        weekStart={new Date(2026, 9, 5)}
        items={[item(), { ...task, date: "2026-10-07" }]}
        todayKey="2026-10-02"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(within(screen.getByTestId("allday-2026-10-07")).getByRole("button", { name: /Dilekçe hazırla/ })).toBeInTheDocument();
    const timed = within(screen.getByTestId("day-2026-10-07")).getByRole("button", { name: /Müvekkil toplantısı/ });
    expect(timed).toHaveStyle({ top: "312px", height: "72px" });
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
  });

  it("creates an event at the clicked hour", async () => {
    const onCreate = vi.fn();
    render(<CalendarWeekView weekStart={new Date(2026, 9, 5)} items={[]} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("button", { name: "Çar 7 Ekim 14:00 için etkinlik ekle" }));

    expect(onCreate).toHaveBeenCalledWith("2026-10-07", "14:00");
  });
});

describe("CalendarAgendaView", () => {
  it("lists the next 30 days by day and highlights today and this week", () => {
    const items = [
      item({ id: "a", title: "Bugünkü toplantı", date: "2026-10-02", start: "2026-10-02T10:00:00", end: "2026-10-02T11:00:00" }),
      item({ id: "b", title: "Hafta sonu işi", date: "2026-10-04", start: null, end: null, all_day: true }),
      item({ id: "c", title: "Gelecek hafta", date: "2026-10-07" }),
      item({ id: "d", title: "Çok ileride", date: "2026-11-05" }),
    ];
    render(<CalendarAgendaView today={new Date(2026, 9, 2)} items={items} onSelect={vi.fn()} />);

    const days = within(screen.getByRole("list", { name: "Ajanda" })).getAllByRole("heading", { level: 3 });
    expect(days.map((h) => h.textContent)).toEqual(["2 Ekim Cuma", "4 Ekim Pazar", "7 Ekim Çarşamba"]);
    expect(screen.getByText("Bugün")).toBeInTheDocument();
    expect(screen.getAllByText("Bu hafta")).toHaveLength(1);
    expect(screen.queryByText("Çok ileride")).not.toBeInTheDocument();
  });

  it("shows an empty message", () => {
    render(<CalendarAgendaView today={new Date(2026, 9, 2)} items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("Önümüzdeki 30 günde kayıt yok.")).toBeInTheDocument();
  });
});

describe("CalendarFilters", () => {
  const users = [{ id: "u1", full_name: "Avukat A" }] as AppUser[];
  const cases = [{ id: "c1", case_name: "Kira Davası" }] as Case[];

  it("reports filter changes as URL updates", async () => {
    const onChange = vi.fn();
    render(<CalendarFilters query={{}} users={users} cases={cases} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Tür"), "Müvekkil görüşmesi");
    await userEvent.selectOptions(screen.getByLabelText("Sorumlu"), "Avukat A");
    await userEvent.selectOptions(screen.getByLabelText("Dava"), "Kira Davası");
    await userEvent.click(screen.getByLabelText("Yalnızca benimkiler"));

    expect(onChange.mock.calls).toEqual([
      [{ tur: "muvekkil", goster: null }],
      [{ sorumlu: "u1" }],
      [{ dava: "c1" }],
      [{ benim: "1" }],
    ]);
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).not.toBeInTheDocument();
  });

  it("clears every filter", async () => {
    const onChange = vi.fn();
    render(<CalendarFilters query={{ tur: "gorev", benim: "1" }} users={users} cases={cases} onChange={onChange} />);

    expect(screen.getByLabelText("Tür")).toHaveValue("gorev");
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));

    expect(onChange).toHaveBeenCalledWith({ tur: null, goster: null, sorumlu: null, dava: null, benim: null });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarViews.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/calendar/CalendarAgendaView"`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/calendar/CalendarItemButton.tsx`:

```tsx
"use client";

import type { CSSProperties } from "react";

import { EVENT_TYPE_LABELS, isTimed, timeLabel } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";

export const TYPE_STYLES: Record<CalendarEvent["event_type"], string> = {
  hearing: "border-red-500 bg-red-50 text-red-800",
  task: "border-accent-500 bg-accent-50 text-accent-800",
  meeting: "border-sky-500 bg-sky-50 text-sky-800",
  client_meeting: "border-emerald-500 bg-emerald-50 text-emerald-800",
  other: "border-navy-500 bg-surface-muted text-navy-800",
};

export const TYPE_DOTS: Record<CalendarEvent["event_type"], string> = {
  hearing: "bg-red-500",
  task: "bg-accent-500",
  meeting: "bg-sky-500",
  client_meeting: "bg-emerald-500",
  other: "bg-navy-500",
};

/** One calendar item as a clickable chip; opens the detail drawer via onSelect. */
export function CalendarItemButton({
  item,
  onSelect,
  className = "w-full",
  style,
}: {
  item: CalendarEvent;
  onSelect: (item: CalendarEvent) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const subtitle = item.case_name ?? item.location ?? EVENT_TYPE_LABELS[item.event_type];
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={style}
      title={[item.title, item.case_name].filter(Boolean).join(" — ")}
      className={`block overflow-hidden rounded-md border-l-2 px-2 py-1 text-left text-[11px] leading-4 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${TYPE_STYLES[item.event_type]} ${className}`}
    >
      <span className="block truncate font-semibold">
        {isTimed(item) && item.start && <span className="mr-1 font-normal opacity-80">{timeLabel(item.start)}</span>}
        {item.title}
      </span>
      <span className="block truncate opacity-70">{subtitle}</span>
    </button>
  );
}
```

Create `frontend/src/components/calendar/CalendarMonthView.tsx`:

```tsx
"use client";

import { useMemo, useState, type MouseEvent } from "react";

import { MONTH_NAMES, WEEKDAYS, groupByDate, toDateKey } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

const MAX_EVENTS_PER_DAY = 3;

export function CalendarMonthView({
  month,
  items,
  todayKey,
  onSelect,
  onCreate,
}: {
  month: Date;
  items: CalendarEvent[];
  todayKey: string;
  onSelect: (item: CalendarEvent) => void;
  onCreate: (dateKey: string) => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const byDate = useMemo(() => groupByDate(items), [items]);

  const cells = useMemo(() => {
    const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const result: Array<number | null> = [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [monthIndex, year]);

  function createOnEmptyClick(key: string) {
    return (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onCreate(key);
    };
  }

  function select(item: CalendarEvent) {
    setOpenDay(null);
    onSelect(item);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-7 border-b border-surface-border bg-surface-muted/60">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-navy-500">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-32 border-b border-r border-surface-border bg-surface-muted/35" />;
            const key = toDateKey(new Date(year, monthIndex, day));
            const dayItems = byDate[key] ?? [];
            const hidden = dayItems.length - MAX_EVENTS_PER_DAY;
            return (
              <div
                key={key}
                onClick={createOnEmptyClick(key)}
                className="group relative min-h-32 cursor-pointer border-b border-r border-surface-border bg-white p-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${
                      key === todayKey ? "bg-accent-600 text-white" : "text-navy-600"
                    }`}
                  >
                    {day}
                  </span>
                  <button
                    type="button"
                    aria-label={`${day} ${MONTH_NAMES[monthIndex]} için etkinlik ekle`}
                    onClick={() => onCreate(key)}
                    className="grid h-6 w-6 place-items-center rounded-md text-sm text-navy-500 opacity-0 transition hover:bg-surface-muted focus:opacity-100 group-hover:opacity-100"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1.5" onClick={createOnEmptyClick(key)}>
                  {dayItems.slice(0, MAX_EVENTS_PER_DAY).map((item) => (
                    <CalendarItemButton key={item.id} item={item} onSelect={select} />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      aria-expanded={openDay === key}
                      onClick={() => setOpenDay((current) => (current === key ? null : key))}
                      className="w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-navy-600 hover:bg-surface-muted"
                    >
                      +{hidden} daha
                    </button>
                  )}
                </div>
                {openDay === key && (
                  <div
                    role="dialog"
                    aria-label={`${day} ${MONTH_NAMES[monthIndex]} olayları`}
                    className="absolute left-1 top-10 z-20 w-64 cursor-default space-y-1.5 rounded-xl border border-surface-border bg-white p-3 shadow-xl"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold text-navy-800">
                        {day} {MONTH_NAMES[monthIndex]}
                      </p>
                      <button type="button" aria-label="Kapat" onClick={() => setOpenDay(null)} className="text-navy-500 hover:text-navy-800">
                        ✕
                      </button>
                    </div>
                    {dayItems.map((item) => (
                      <CalendarItemButton key={`popover-${item.id}`} item={item} onSelect={select} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/calendar/CalendarWeekView.tsx`:

```tsx
"use client";

import { useMemo } from "react";

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  MONTH_NAMES,
  WEEKDAYS,
  addDays,
  groupByDate,
  isTimed,
  timedBlock,
  toDateKey,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
const GRID_COLUMNS = "grid grid-cols-[64px_repeat(7,minmax(0,1fr))]";

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function CalendarWeekView({
  weekStart,
  items,
  todayKey,
  onSelect,
  onCreate,
}: {
  weekStart: Date;
  items: CalendarEvent[];
  todayKey: string;
  onSelect: (item: CalendarEvent) => void;
  onCreate: (dateKey: string, time?: string) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const byDate = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`${GRID_COLUMNS} border-b border-surface-border bg-surface-muted/60`}>
          <div />
          {days.map((day, index) => {
            const key = toDateKey(day);
            return (
              <div key={key} className="px-2 py-2 text-center text-xs font-semibold text-navy-600">
                <span className="uppercase tracking-wide text-navy-500">{WEEKDAYS[index]}</span>{" "}
                <span
                  className={`ml-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 ${
                    key === todayKey ? "bg-accent-600 text-white" : "text-navy-800"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className={`${GRID_COLUMNS} border-b border-surface-border`}>
          <div className="px-2 py-2 text-right text-[11px] font-medium text-navy-500">Tüm gün</div>
          {days.map((day) => {
            const key = toDateKey(day);
            return (
              <div key={key} data-testid={`allday-${key}`} className="min-h-10 space-y-1 border-l border-surface-border p-1">
                {(byDate[key] ?? []).filter((item) => !isTimed(item)).map((item) => (
                  <CalendarItemButton key={item.id} item={item} onSelect={onSelect} />
                ))}
              </div>
            );
          })}
        </div>

        <div className={GRID_COLUMNS}>
          <div>
            {HOURS.map((hour) => (
              <div key={hour} style={{ height: HOUR_HEIGHT }} className="pr-2 pt-0.5 text-right text-[11px] text-navy-500">
                {hourLabel(hour)}
              </div>
            ))}
          </div>
          {days.map((day, index) => {
            const key = toDateKey(day);
            const label = `${WEEKDAYS[index]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
            return (
              <div key={key} data-testid={`day-${key}`} className="relative border-l border-surface-border">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-label={`${label} ${hourLabel(hour)} için etkinlik ekle`}
                    onClick={() => onCreate(key, hourLabel(hour))}
                    style={{ height: HOUR_HEIGHT }}
                    className="block w-full border-b border-surface-border transition hover:bg-accent-50/50 focus:outline-none focus-visible:bg-accent-50"
                  />
                ))}
                {(byDate[key] ?? []).filter(isTimed).map((item) => {
                  const { top, height } = timedBlock(item);
                  return (
                    <CalendarItemButton
                      key={item.id}
                      item={item}
                      onSelect={onSelect}
                      style={{ top, height }}
                      className="absolute left-1 right-1 z-10 shadow-sm"
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/calendar/CalendarAgendaView.tsx`:

```tsx
"use client";

import { AGENDA_DAYS, MONTH_NAMES, WEEKDAY_NAMES, addDays, groupByDate, parseDateKey, startOfWeek, toDateKey } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

export function CalendarAgendaView({
  today,
  items,
  onSelect,
}: {
  today: Date;
  items: CalendarEvent[];
  onSelect: (item: CalendarEvent) => void;
}) {
  const todayKey = toDateKey(today);
  const lastKey = toDateKey(addDays(today, AGENDA_DAYS - 1));
  const weekEndKey = toDateKey(addDays(startOfWeek(today), 6));
  const byDate = groupByDate(items);
  const keys = Object.keys(byDate)
    .filter((key) => key >= todayKey && key <= lastKey)
    .sort();

  if (keys.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-navy-500">Önümüzdeki 30 günde kayıt yok.</p>;
  }

  return (
    <ol aria-label="Ajanda" className="divide-y divide-surface-border">
      {keys.map((key) => {
        const date = parseDateKey(key);
        const isToday = key === todayKey;
        const thisWeek = !isToday && key <= weekEndKey;
        return (
          <li key={key} className={`px-5 py-4 ${isToday ? "bg-accent-50/50" : ""}`}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-navy-900">
                {date.getDate()} {MONTH_NAMES[date.getMonth()]} {WEEKDAY_NAMES[(date.getDay() + 6) % 7]}
              </h3>
              {isToday && <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[11px] font-medium text-white">Bugün</span>}
              {thisWeek && (
                <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-800">Bu hafta</span>
              )}
            </div>
            <ul className="space-y-1.5">
              {byDate[key].map((item) => (
                <li key={item.id}>
                  <CalendarItemButton item={item} onSelect={onSelect} className="w-full text-xs" />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
```

Create `frontend/src/components/calendar/CalendarFilters.tsx`:

```tsx
"use client";

import { EVENT_TYPE_LABELS, TYPE_SLUG_TO_EVENT_TYPE } from "@/lib/calendar";
import { CALENDAR_TYPE_SLUGS, type CalendarQuery } from "@/lib/filters";
import type { AppUser, Case } from "@/types";

type FilterUpdates = Record<string, string | null>;

const SELECT_CLASS =
  "mt-1 block w-48 rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-sm text-navy-800 outline-none focus:border-accent-400";

export function CalendarFilters({
  query,
  users,
  cases,
  onChange,
}: {
  query: CalendarQuery;
  users: AppUser[];
  cases: Case[];
  onChange: (updates: FilterUpdates) => void;
}) {
  const active = Boolean(query.tur || query.sorumlu || query.dava || query.benim);
  return (
    <div role="group" aria-label="Takvim filtreleri" className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="calendar-filter-type" className="text-xs font-medium text-navy-600">
          Tür
        </label>
        <select
          id="calendar-filter-type"
          value={query.tur ?? ""}
          onChange={(event) => onChange({ tur: event.target.value || null, goster: null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {CALENDAR_TYPE_SLUGS.map((slug) => (
            <option key={slug} value={slug}>
              {EVENT_TYPE_LABELS[TYPE_SLUG_TO_EVENT_TYPE[slug]]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="calendar-filter-assignee" className="text-xs font-medium text-navy-600">
          Sorumlu
        </label>
        <select
          id="calendar-filter-assignee"
          value={query.sorumlu ?? ""}
          onChange={(event) => onChange({ sorumlu: event.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="calendar-filter-case" className="text-xs font-medium text-navy-600">
          Dava
        </label>
        <select
          id="calendar-filter-case"
          value={query.dava ?? ""}
          onChange={(event) => onChange({ dava: event.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.case_name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-1.5 text-sm text-navy-700">
        <input
          type="checkbox"
          checked={query.benim === "1"}
          onChange={(event) => onChange({ benim: event.target.checked ? "1" : null })}
          className="h-4 w-4 accent-accent-600"
        />
        Yalnızca benimkiler
      </label>
      {active && (
        <button
          type="button"
          onClick={() => onChange({ tur: null, goster: null, sorumlu: null, dava: null, benim: null })}
          className="pb-1.5 text-xs font-medium text-accent-700 hover:underline"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarViews.test.tsx && npx tsc --noEmit`
Expected: 8 passed, no type errors.

- [ ] **Step: Commit**

```bash
git add frontend/src/components/calendar/CalendarItemButton.tsx frontend/src/components/calendar/CalendarMonthView.tsx frontend/src/components/calendar/CalendarWeekView.tsx frontend/src/components/calendar/CalendarAgendaView.tsx frontend/src/components/calendar/CalendarFilters.tsx frontend/src/components/__tests__/CalendarViews.test.tsx
git commit -F - <<'EOF'
feat(web): calendar month, week and agenda views with filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 8: Reminder picker, event form modal and detail drawer

**Files:**
- Create: `frontend/src/components/calendar/ReminderPicker.tsx`, `CalendarEventForm.tsx`, `CalendarEventDrawer.tsx`
- Test: `frontend/src/components/__tests__/CalendarEventForm.test.tsx` (new), `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx` (new)

**Interfaces:**
- Consumes: Task 6 API (`createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `updateTaskReminders`, existing `updateTaskStatus(caseId, taskId, status)`), helpers; Task 7 `TYPE_DOTS`; existing `CaseSearchSelect` (`components/ai/CaseSearchSelect.tsx`) and `caseDetailHref`.
- Produces:
  - `ReminderPicker({ value: number[], onChange(days), legend = "Hatırlatma" })` — checkboxes Aynı gün / 1 / 3 / 7 gün önce + "Hatırlatma yok"; output sorted largest first.
  - `EventFormInitial { id?, title?, event_type?, date, time?, all_day?, duration_minutes?, location?, notes?, case_id?, assignee_id?, reminder_days? }`, `eventFormInitialFromItem(item: CalendarEvent): EventFormInitial`, `CalendarEventForm({ initial, cases, users, onClose, onSaved(record) })` — headings "Yeni etkinlik" / "Etkinliği düzenle"; untouched reminders follow the type default; validation messages `Başlık zorunludur.`, `Tarih zorunludur.`, `Saat zorunludur.`, `Süre 5 ile 1440 dakika arasında olmalıdır.`; API failure `Etkinlik kaydedilemedi: <detail>`.
  - `CalendarEventDrawer({ item, onClose, onEdit(item), onChanged() })` — event: Düzenle / Hatırlatmayı değiştir / Sil (inline "Bu etkinlik silinsin mi?" → "Evet, sil"); task: Tamamlandı / Hatırlatmayı değiştir / Göreve git (`/davalar/<case>?sekme=gorevler`); case hearing: Davayı aç + default-reminder note.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/CalendarEventForm.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();

vi.mock("@/lib/api", () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
}));

import { CalendarEventForm, eventFormInitialFromItem } from "@/components/calendar/CalendarEventForm";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";
import { ApiError } from "@/lib/apiError";
import type { AppUser, CalendarEvent, Case } from "@/types";

const cases = [
  { id: "c1", case_name: "Ticari Kira Uyarlama Davası", case_number: "2026/14", client_name: "Deniz Arslan" },
] as Case[];
const users = [{ id: "u1", full_name: "Avukat A" }] as AppUser[];

beforeEach(() => {
  createCalendarEvent.mockReset();
  updateCalendarEvent.mockReset();
});

describe("ReminderPicker", () => {
  it("toggles offsets largest first and clears with 'Hatırlatma yok'", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ReminderPicker value={[1]} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("3 gün önce"));
    expect(onChange).toHaveBeenLastCalledWith([3, 1]);
    await userEvent.click(screen.getByLabelText("1 gün önce"));
    expect(onChange).toHaveBeenLastCalledWith([]);

    rerender(<ReminderPicker value={[]} onChange={onChange} />);
    expect(screen.getByLabelText("Hatırlatma yok")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Aynı gün"));
    expect(onChange).toHaveBeenLastCalledWith([0]);
  });
});

describe("CalendarEventForm", () => {
  it("validates required fields before sending", async () => {
    render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText("Süre (dakika)"));
    await userEvent.type(screen.getByLabelText("Süre (dakika)"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Başlık zorunludur.");
    expect(alert).toHaveTextContent("Süre 5 ile 1440 dakika arasında olmalıdır.");
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("creates an event with case, assignee and type-based reminder defaults", async () => {
    const record = { id: "e1" };
    createCalendarEvent.mockResolvedValue(record);
    const onSaved = vi.fn();
    render(
      <CalendarEventForm initial={{ date: "2026-10-07", time: "14:00" }} cases={cases} users={users} onClose={vi.fn()} onSaved={onSaved} />,
    );

    expect(screen.getByRole("heading", { name: "Yeni etkinlik" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Başlık"), "  Kira duruşması ");
    await userEvent.selectOptions(screen.getByLabelText("Tür"), "Duruşma");
    expect(screen.getByLabelText("3 gün önce")).toBeChecked(); // hearing default [3, 1]
    await userEvent.clear(screen.getByLabelText("Süre (dakika)"));
    await userEvent.type(screen.getByLabelText("Süre (dakika)"), "90");
    await userEvent.click(within(screen.getByRole("list", { name: "Davalar" })).getByRole("button", { name: /Ticari Kira/ }));
    await userEvent.selectOptions(screen.getByLabelText("Sorumlu"), "Avukat A");
    await userEvent.type(screen.getByLabelText("Konum"), "İstanbul Adliyesi");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(record));
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Kira duruşması",
      event_type: "hearing",
      starts_at: "2026-10-07T14:00:00",
      all_day: false,
      duration_minutes: 90,
      location: "İstanbul Adliyesi",
      notes: null,
      case_id: "c1",
      assignee_id: "u1",
      reminder_days: [3, 1],
    });
  });

  it("sends all-day events at midnight without a reminder when 'Hatırlatma yok' is chosen", async () => {
    createCalendarEvent.mockResolvedValue({ id: "e2" });
    render(<CalendarEventForm initial={{ date: "2026-10-08" }} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Başlık"), "Bayram");
    await userEvent.click(screen.getByLabelText("Tüm gün"));
    expect(screen.getByLabelText("Saat")).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Hatırlatma yok"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalled());
    expect(createCalendarEvent.mock.calls[0][0]).toMatchObject({ starts_at: "2026-10-08T00:00:00", all_day: true, reminder_days: [] });
  });

  it("edits an existing event and shows API errors", async () => {
    updateCalendarEvent.mockRejectedValue(new ApiError("Dava bulunamadı", 404));
    const item: CalendarEvent = {
      id: "event:e1", kind: "event", event_type: "client_meeting", title: "Müvekkil görüşmesi", date: "2026-10-07",
      start: "2026-10-07T10:30:00", end: "2026-10-07T11:15:00", all_day: false, case_id: null, case_name: null,
      task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: "Not",
      reminder_days: [7], editable: true,
    };
    render(<CalendarEventForm initial={eventFormInitialFromItem(item)} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Etkinliği düzenle" })).toBeInTheDocument();
    expect(screen.getByLabelText("Saat")).toHaveValue("10:30");
    expect(screen.getByLabelText("Süre (dakika)")).toHaveValue(45);
    expect(screen.getByLabelText("7 gün önce")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Etkinlik kaydedilemedi: Dava bulunamadı"));
    expect(updateCalendarEvent).toHaveBeenCalledWith("e1", expect.objectContaining({ event_type: "client_meeting", reminder_days: [7] }));
  });

  it("closes with Vazgeç and Escape", async () => {
    const onClose = vi.fn();
    render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={onClose} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

Create `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const updateTaskReminders = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  updateTaskReminders: (...args: unknown[]) => updateTaskReminders(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import type { CalendarEvent } from "@/types";

const event: CalendarEvent = {
  id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
  start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: "c1",
  case_name: "Ticari Kira Uyarlama Davası", task_id: null, event_id: "e1", assignee_id: "u1",
  assignee_name: "Avukat A", location: "Büro", notes: "Belgeleri getir", reminder_days: [3, 1], editable: true,
};
const task: CalendarEvent = {
  ...event, id: "task:t1", kind: "task", event_type: "task", title: "Dilekçe hazırla", start: null, end: null,
  all_day: true, task_id: "t1", event_id: null, location: null, notes: null, reminder_days: [1], editable: false,
};
const hearing: CalendarEvent = {
  ...event, id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Ticari Kira Uyarlama Davası",
  start: null, end: null, all_day: true, event_id: null, notes: null, reminder_days: [3, 1], editable: false,
};

function renderDrawer(item: CalendarEvent) {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onChanged: vi.fn() };
  render(<CalendarEventDrawer item={item} {...handlers} />);
  return handlers;
}

beforeEach(() => {
  [deleteCalendarEvent, updateCalendarEvent, updateTaskReminders, updateTaskStatus].forEach((fn) => fn.mockReset());
});

describe("CalendarEventDrawer", () => {
  it("shows the event details", () => {
    renderDrawer(event);
    const dialog = screen.getByRole("dialog", { name: "Müvekkil toplantısı" });
    expect(dialog).toHaveTextContent("Toplantı");
    expect(dialog).toHaveTextContent("7 Ekim 2026 Çarşamba");
    expect(dialog).toHaveTextContent("14:30 – 16:00");
    expect(dialog).toHaveTextContent("Avukat A");
    expect(dialog).toHaveTextContent("Büro");
    expect(dialog).toHaveTextContent("Belgeleri getir");
    expect(dialog).toHaveTextContent("3 gün önce, 1 gün önce");
    expect(screen.getByRole("link", { name: "Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/davalar/c1");
  });

  it("edits, changes reminders and deletes an event after inline confirmation", async () => {
    updateCalendarEvent.mockResolvedValue({});
    deleteCalendarEvent.mockResolvedValue(undefined);
    const handlers = renderDrawer(event);

    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(event);

    await userEvent.click(screen.getByRole("button", { name: "Hatırlatmayı değiştir" }));
    await userEvent.click(screen.getByLabelText("7 gün önce"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledWith("e1", { reminder_days: [7, 3, 1] }));
    expect(handlers.onChanged).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(screen.getByText("Bu etkinlik silinsin mi?")).toBeInTheDocument();
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    await waitFor(() => expect(deleteCalendarEvent).toHaveBeenCalledWith("e1"));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("completes a task, changes its reminders and links to the case tasks", async () => {
    updateTaskReminders.mockResolvedValue({});
    updateTaskStatus.mockResolvedValue({});
    const handlers = renderDrawer(task);

    expect(screen.getByRole("dialog")).toHaveTextContent("Tüm gün");
    expect(screen.getByRole("link", { name: "Göreve git" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
    expect(screen.queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hatırlatmayı değiştir" }));
    await userEvent.click(screen.getByLabelText("Hatırlatma yok"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateTaskReminders).toHaveBeenCalledWith("t1", []));

    await userEvent.click(screen.getByRole("button", { name: "Tamamlandı" }));
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith("c1", "t1", "completed"));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("shows case hearings read-only with a link to the case", () => {
    renderDrawer(hearing);
    expect(screen.getByRole("link", { name: "Davayı aç" })).toHaveAttribute("href", "/davalar/c1");
    expect(screen.getByText(/varsayılan hatırlatma: 3 gün ve 1 gün önce/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hatırlatmayı değiştir" })).not.toBeInTheDocument();
  });

  it("shows an error when an action fails and closes on Escape", async () => {
    deleteCalendarEvent.mockRejectedValue(new Error("x"));
    const handlers = renderDrawer(event);
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Etkinlik silinemedi.");

    await userEvent.keyboard("{Escape}");
    expect(handlers.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarEventForm.test.tsx src/components/__tests__/CalendarEventDrawer.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/calendar/CalendarEventForm"`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/calendar/ReminderPicker.tsx`:

```tsx
"use client";

import { REMINDER_OPTIONS, reminderDayLabel } from "@/lib/calendar";

const CHIP = "flex items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-sm text-navy-700";

/** Multi-select of reminder offsets; an empty list means "Hatırlatma yok". */
export function ReminderPicker({
  value,
  onChange,
  legend = "Hatırlatma",
}: {
  value: number[];
  onChange: (days: number[]) => void;
  legend?: string;
}) {
  function toggle(days: number) {
    const next = value.includes(days) ? value.filter((d) => d !== days) : [...value, days];
    onChange(Array.from(new Set(next)).sort((a, b) => b - a));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-navy-600">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {REMINDER_OPTIONS.map((days) => (
          <label key={days} className={CHIP}>
            <input type="checkbox" checked={value.includes(days)} onChange={() => toggle(days)} className="h-4 w-4 accent-accent-600" />
            {reminderDayLabel(days)}
          </label>
        ))}
        <label className={CHIP}>
          <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} className="h-4 w-4 accent-accent-600" />
          Hatırlatma yok
        </label>
      </div>
    </fieldset>
  );
}
```

Create `frontend/src/components/calendar/CalendarEventForm.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { createCalendarEvent, updateCalendarEvent } from "@/lib/api";
import { DEFAULT_REMINDER_DAYS, EVENT_TYPE_LABELS, EVENT_TYPE_OPTIONS, durationMinutes, timeLabel } from "@/lib/calendar";
import type { AppUser, CalendarEvent, CalendarEventPayload, CalendarEventRecord, CalendarEventType, Case } from "@/types";
import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";

export interface EventFormInitial {
  id?: string; // set -> edit
  title?: string;
  event_type?: CalendarEventType;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  all_day?: boolean;
  duration_minutes?: number;
  location?: string | null;
  notes?: string | null;
  case_id?: string | null;
  assignee_id?: string | null;
  reminder_days?: number[];
}

export function eventFormInitialFromItem(item: CalendarEvent): EventFormInitial {
  return {
    id: item.event_id ?? undefined,
    title: item.title,
    event_type: item.event_type === "task" ? "other" : item.event_type,
    date: item.date,
    time: item.start ? timeLabel(item.start) : "09:00",
    all_day: item.all_day,
    duration_minutes: durationMinutes(item),
    location: item.location,
    notes: item.notes,
    case_id: item.case_id,
    assignee_id: item.assignee_id,
    reminder_days: item.reminder_days,
  };
}

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

export function CalendarEventForm({
  initial,
  cases,
  users,
  onClose,
  onSaved,
}: {
  initial: EventFormInitial;
  cases: Case[];
  users: AppUser[];
  onClose: () => void;
  onSaved: (record: CalendarEventRecord) => void;
}) {
  const editing = Boolean(initial.id);
  const initialType = initial.event_type ?? "meeting";
  const [title, setTitle] = useState(initial.title ?? "");
  const [eventType, setEventType] = useState<CalendarEventType>(initialType);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time ?? "09:00");
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [duration, setDuration] = useState(String(initial.duration_minutes ?? 60));
  const [caseId, setCaseId] = useState<string | null>(initial.case_id ?? null);
  const [assigneeId, setAssigneeId] = useState(initial.assignee_id ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [reminders, setReminders] = useState<number[]>(initial.reminder_days ?? DEFAULT_REMINDER_DAYS[initialType]);
  const [remindersTouched, setRemindersTouched] = useState(editing);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeType(next: CalendarEventType) {
    setEventType(next);
    if (!remindersTouched) setReminders(DEFAULT_REMINDER_DAYS[next]);
  }

  function changeReminders(next: number[]) {
    setRemindersTouched(true);
    setReminders(next);
  }

  function validate(): string[] {
    const problems: string[] = [];
    const minutes = Number(duration);
    if (!title.trim()) problems.push("Başlık zorunludur.");
    if (!date) problems.push("Tarih zorunludur.");
    if (!allDay && !time) problems.push("Saat zorunludur.");
    if (!allDay && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) {
      problems.push("Süre 5 ile 1440 dakika arasında olmalıdır.");
    }
    return problems;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length > 0) return;

    const minutes = Number(duration);
    const payload: CalendarEventPayload = {
      title: title.trim(),
      event_type: eventType,
      starts_at: `${date}T${allDay ? "00:00" : time}:00`,
      all_day: allDay,
      duration_minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 60,
      location: location.trim() || null,
      notes: notes.trim() || null,
      case_id: caseId,
      assignee_id: assigneeId || null,
      reminder_days: reminders,
    };
    setSaving(true);
    try {
      const record = initial.id ? await updateCalendarEvent(initial.id, payload) : await createCalendarEvent(payload);
      onSaved(record);
    } catch (error) {
      setErrors([error instanceof Error ? `Etkinlik kaydedilemedi: ${error.message}` : "Etkinlik kaydedilemedi."]);
    } finally {
      setSaving(false);
    }
  }

  const selectedCase = cases.find((item) => item.id === caseId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
      >
        <form onSubmit={submit} noValidate>
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <h2 id="event-form-title" className="text-base font-semibold text-navy-900">
              {editing ? "Etkinliği düzenle" : "Yeni etkinlik"}
            </h2>
            <button type="button" onClick={onClose} aria-label="Formu kapat" className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted">
              ✕
            </button>
          </div>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            {errors.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
                {errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="event-title" className={LABEL}>Başlık</label>
              <input id="event-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="event-type" className={LABEL}>Tür</label>
              <select id="event-type" value={eventType} onChange={(e) => changeType(e.target.value as CalendarEventType)} className={INPUT}>
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-date" className={LABEL}>Tarih</label>
              <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-700 sm:col-span-2">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Tüm gün
            </label>
            <div>
              <label htmlFor="event-time" className={LABEL}>Saat</label>
              <input id="event-time" type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="event-duration" className={LABEL}>Süre (dakika)</label>
              <input
                id="event-duration"
                type="number"
                min={5}
                max={1440}
                step={5}
                value={duration}
                disabled={allDay}
                onChange={(e) => setDuration(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="sm:col-span-2">
              <CaseSearchSelect cases={cases} value={caseId} onChange={setCaseId} />
              {selectedCase && (
                <button type="button" onClick={() => setCaseId(null)} className="mt-1 text-xs font-medium text-accent-700 hover:underline">
                  Davayı kaldır
                </button>
              )}
            </div>
            <div>
              <label htmlFor="event-assignee" className={LABEL}>Sorumlu</label>
              <select id="event-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
                <option value="">Seçilmedi</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-location" className={LABEL}>Konum</label>
              <input id="event-location" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="event-notes" className={LABEL}>Not</label>
              <textarea id="event-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <ReminderPicker value={reminders} onChange={changeReminders} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
              Vazgeç
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/calendar/CalendarEventDrawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { deleteCalendarEvent, updateCalendarEvent, updateTaskReminders, updateTaskStatus } from "@/lib/api";
import { EVENT_TYPE_LABELS, describeReminders, formatDayLong, isTimed, timeLabel } from "@/lib/calendar";
import { caseDetailHref } from "@/lib/filters";
import type { CalendarEvent } from "@/types";
import { TYPE_DOTS } from "@/components/calendar/CalendarItemButton";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";

const SECONDARY_BUTTON =
  "rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-60";
const PRIMARY_BUTTON = "rounded-xl bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60";

export function CalendarEventDrawer({
  item,
  onClose,
  onEdit,
  onChanged,
}: {
  item: CalendarEvent;
  onClose: () => void;
  onEdit: (item: CalendarEvent) => void;
  onChanged: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingReminders, setEditingReminders] = useState(false);
  const [reminders, setReminders] = useState<number[]>(item.reminder_days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reminderKey = item.reminder_days.join(",");

  useEffect(() => {
    setReminders(item.reminder_days);
    setEditingReminders(false);
    setConfirmingDelete(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, reminderKey]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function run(action: () => Promise<unknown>, after: () => void, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function saveReminders() {
    return run(
      () =>
        item.kind === "event"
          ? updateCalendarEvent(item.event_id as string, { reminder_days: reminders })
          : updateTaskReminders(item.task_id as string, reminders),
      () => {
        setEditingReminders(false);
        onChanged();
      },
      "Hatırlatma kaydedilemedi.",
    );
  }

  function remove() {
    return run(() => deleteCalendarEvent(item.event_id as string), () => {
      onChanged();
      onClose();
    }, "Etkinlik silinemedi.");
  }

  function complete() {
    return run(() => updateTaskStatus(item.case_id as string, item.task_id as string, "completed"), () => {
      onChanged();
      onClose();
    }, "Görev güncellenemedi.");
  }

  const timeText = isTimed(item) && item.start && item.end ? `${timeLabel(item.start)} – ${timeLabel(item.end)}` : "Tüm gün";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-drawer-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-white shadow-xl outline-none sm:w-[420px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-navy-600">
              <i className={`h-2.5 w-2.5 rounded-full ${TYPE_DOTS[item.event_type]}`} />
              {EVENT_TYPE_LABELS[item.event_type]}
            </p>
            <h2 id="calendar-drawer-title" className="mt-1 text-base font-semibold text-navy-900">
              {item.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Paneli kapat" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
            <dt className="text-navy-500">Tarih</dt>
            <dd className="text-navy-800">{formatDayLong(item.date)}</dd>
            <dt className="text-navy-500">Saat</dt>
            <dd className="text-navy-800">{timeText}</dd>
            {item.case_id && item.case_name && (
              <>
                <dt className="text-navy-500">Dava</dt>
                <dd>
                  <Link href={caseDetailHref(item.case_id)} className="font-medium text-accent-700 hover:underline">
                    {item.case_name}
                  </Link>
                </dd>
              </>
            )}
            <dt className="text-navy-500">Sorumlu</dt>
            <dd className="text-navy-800">{item.assignee_name ?? "Atanmadı"}</dd>
            {item.location && (
              <>
                <dt className="text-navy-500">Konum</dt>
                <dd className="text-navy-800">{item.location}</dd>
              </>
            )}
            {item.notes && (
              <>
                <dt className="text-navy-500">Not</dt>
                <dd className="whitespace-pre-wrap text-navy-800">{item.notes}</dd>
              </>
            )}
            <dt className="text-navy-500">Hatırlatmalar</dt>
            <dd className="text-navy-800">{describeReminders(item.reminder_days)}</dd>
          </dl>

          {item.kind === "case_hearing" && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-navy-600">
              Dava duruşmalarında varsayılan hatırlatma: 3 gün ve 1 gün önce, davanın sorumlu avukatına e-posta.
            </p>
          )}

          {editingReminders && (
            <div className="space-y-3 rounded-xl border border-surface-border p-3">
              <ReminderPicker value={reminders} onChange={setReminders} legend="Hatırlatmaları değiştir" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={saveReminders} className={PRIMARY_BUTTON}>
                  Kaydet
                </button>
                <button type="button" onClick={() => setEditingReminders(false)} className={SECONDARY_BUTTON}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {confirmingDelete && (
            <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-3 text-red-800">
              <p>Bu etkinlik silinsin mi?</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={remove} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  Evet, sil
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={SECONDARY_BUTTON}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-surface-border p-4">
          {item.kind === "event" && (
            <>
              <button type="button" onClick={() => onEdit(item)} className={PRIMARY_BUTTON}>
                Düzenle
              </button>
              <button type="button" onClick={() => setEditingReminders(true)} className={SECONDARY_BUTTON}>
                Hatırlatmayı değiştir
              </button>
              <button type="button" onClick={() => setConfirmingDelete(true)} className={SECONDARY_BUTTON}>
                Sil
              </button>
            </>
          )}
          {item.kind === "task" && (
            <>
              <button type="button" disabled={busy} onClick={complete} className={PRIMARY_BUTTON}>
                Tamamlandı
              </button>
              <button type="button" onClick={() => setEditingReminders(true)} className={SECONDARY_BUTTON}>
                Hatırlatmayı değiştir
              </button>
              {item.case_id && (
                <Link href={caseDetailHref(item.case_id, "gorevler")} className={SECONDARY_BUTTON}>
                  Göreve git
                </Link>
              )}
            </>
          )}
          {item.kind === "case_hearing" && item.case_id && (
            <Link href={caseDetailHref(item.case_id)} className={PRIMARY_BUTTON}>
              Davayı aç
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarEventForm.test.tsx src/components/__tests__/CalendarEventDrawer.test.tsx && npx tsc --noEmit`
Expected: 11 passed, no type errors.

- [ ] **Step: Commit**

```bash
git add frontend/src/components/calendar/ReminderPicker.tsx frontend/src/components/calendar/CalendarEventForm.tsx frontend/src/components/calendar/CalendarEventDrawer.tsx frontend/src/components/__tests__/CalendarEventForm.test.tsx frontend/src/components/__tests__/CalendarEventDrawer.test.tsx
git commit -F - <<'EOF'
feat(web): calendar event form, reminder picker and detail drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 9: CalendarView — views, URL state, filters, drawer and form wired together

**Files:**
- Modify (rewrite): `frontend/src/components/CalendarView.tsx`
- Test (rewrite): `frontend/src/components/__tests__/CalendarView.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–8; `getMe`, `listUsers`, `getCases` (existing).
- Produces: `/takvim` page behaviour — view switch group "Görünüm" (Ay / Hafta / Ajanda, `aria-pressed`), nav buttons "Önceki ay|hafta", "Bugün", "Sonraki ay|hafta", header button "Yeni etkinlik"; fetches `getCalendarEvents(range)` per view/period; reloads after save/delete/complete/reminder change. Item clicks now open the drawer (they no longer link to the case quick view; the drawer has "Davayı aç" / dava link).

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/components/__tests__/CalendarView.test.tsx` with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCalendarEvents = vi.fn();
const getMe = vi.fn();
const listUsers = vi.fn();
const getCases = vi.fn();
const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const deleteCalendarEvent = vi.fn();
const updateTaskReminders = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getCalendarEvents: (...args: unknown[]) => getCalendarEvents(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listUsers: (...args: unknown[]) => listUsers(...args),
  getCases: (...args: unknown[]) => getCases(...args),
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  updateTaskReminders: (...args: unknown[]) => updateTaskReminders(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { CalendarView } from "@/components/CalendarView";
import type { CalendarEvent } from "@/types";

function item(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
    start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: null, case_name: null,
    task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: null,
    reminder_days: [1], editable: true, ...overrides,
  };
}

const hearing = item({
  id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Sözleşmenin Feshi Davası",
  date: "2026-10-05", start: null, end: null, all_day: true, case_id: "c1", case_name: "Sözleşmenin Feshi Davası",
  event_id: null, assignee_id: "u2", assignee_name: "Avukat B", reminder_days: [3, 1], editable: false,
});
const task = item({
  id: "task:t9", kind: "task", event_type: "task", title: "Dilekçe hazırla", date: "2026-09-20", start: null, end: null,
  all_day: true, case_id: "c2", case_name: "Boşanma Davası", task_id: "t9", event_id: null, editable: false,
});
const meeting = item({});

/** Answers getCalendarEvents with the items inside the requested range. */
function serve(items: CalendarEvent[]) {
  getCalendarEvents.mockImplementation(async (range: { from: string; to: string }) =>
    items.filter((i) => i.date >= range.from && i.date <= range.to),
  );
}

beforeEach(() => {
  resetNav();
  setUrl("/takvim");
  [getCalendarEvents, getMe, listUsers, getCases, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
    updateTaskReminders, updateTaskStatus].forEach((fn) => fn.mockReset());
  getMe.mockResolvedValue({ id: "u1", full_name: "Avukat A" });
  listUsers.mockResolvedValue([{ id: "u1", full_name: "Avukat A" }, { id: "u2", full_name: "Avukat B" }]);
  getCases.mockResolvedValue([{ id: "c1", case_name: "Sözleşmenin Feshi Davası", case_number: "2026/1", client_name: "X" }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView", () => {
  it("loads the visible month and navigates between months", async () => {
    setUrl("/takvim?ay=2026-09");
    serve([task, hearing]);
    render(<CalendarView />);

    expect(await screen.findByText("Dilekçe hazırla")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-30" });

    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));
    expect(await screen.findByText("Duruşma - Sözleşmenin Feshi Davası")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "2026-10-31" });
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-10", { scroll: false });
  });

  it("shows an empty state when there are no events", async () => {
    serve([]);
    render(<CalendarView />);
    await waitFor(() => expect(screen.getByText(/takvimde.*yok/i)).toBeInTheDocument());
  });

  it("shows an error when the calendar cannot be loaded", async () => {
    getCalendarEvents.mockRejectedValue(new Error("x"));
    render(<CalendarView />);
    expect(await screen.findByText("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });

  it("keeps legacy ?goster= links working as a type filter", async () => {
    setUrl("/takvim?ay=2026-10&goster=durusma");
    serve([hearing, meeting]);
    render(<CalendarView />);

    await screen.findByText("Duruşma - Sözleşmenin Feshi Davası");
    expect(screen.queryByText("Müvekkil toplantısı")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tür")).toHaveValue("durusma");
  });

  it("filters to my items and writes the filter to the URL", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([hearing, meeting]);
    render(<CalendarView />);
    await screen.findByText("Müvekkil toplantısı");
    await waitFor(() => expect(getMe).toHaveBeenCalled());

    await userEvent.click(screen.getByLabelText("Yalnızca benimkiler"));

    expect(screen.queryByText("Duruşma - Sözleşmenin Feshi Davası")).not.toBeInTheDocument();
    expect(screen.getByText("Müvekkil toplantısı")).toBeInTheDocument();
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-10&benim=1", { scroll: false });
  });

  it("switches to the week view, loads that week and navigates by week", async () => {
    setUrl("/takvim?hafta=2026-10-07");
    serve([meeting]);
    render(<CalendarView />);
    await screen.findByText("Takvim");

    await userEvent.click(screen.getByRole("button", { name: "Hafta" }));

    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?hafta=2026-10-07&gorunum=hafta", { scroll: false });
    expect(await screen.findByText("5 – 11 Ekim 2026")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-05", to: "2026-10-11" });
    expect(within(screen.getByTestId("day-2026-10-07")).getByRole("button", { name: /Müvekkil toplantısı/ })).toHaveStyle({ top: "312px" });

    await userEvent.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("lists the next 30 days in the agenda view", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0));
    setUrl("/takvim?gorunum=ajanda");
    serve([hearing, meeting]);
    render(<CalendarView />);

    expect(await screen.findByRole("list", { name: "Ajanda" })).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenCalledWith({ from: "2026-10-02", to: "2026-10-31" });
    expect(screen.getByText("5 Ekim Pazartesi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bugün" })).not.toBeInTheDocument();
  });

  it("opens the detail drawer, edits the event and reloads after saving", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([meeting]);
    updateCalendarEvent.mockResolvedValue({ id: "e1" });
    render(<CalendarView />);

    await userEvent.click(await screen.findByRole("button", { name: /Müvekkil toplantısı/ }));
    expect(screen.getByRole("dialog", { name: "Müvekkil toplantısı" })).toHaveTextContent("14:30 – 16:00");

    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(screen.queryByRole("dialog", { name: "Müvekkil toplantısı" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Başlık")).toHaveValue("Müvekkil toplantısı");
    const calls = getCalendarEvents.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledWith("e1", expect.objectContaining({ starts_at: "2026-10-07T14:30:00" })));
    await waitFor(() => expect(getCalendarEvents.mock.calls.length).toBe(calls + 1));
    expect(screen.queryByRole("heading", { name: "Etkinliği düzenle" })).not.toBeInTheDocument();
  });

  it("opens the add form on the clicked day", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([]);
    render(<CalendarView />);

    await userEvent.click(await screen.findByRole("button", { name: "12 Ekim için etkinlik ekle" }));

    expect(screen.getByRole("heading", { name: "Yeni etkinlik" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tarih")).toHaveValue("2026-10-12");
    expect(screen.getByLabelText("Saat")).toHaveValue("09:00");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarView.test.tsx`
Expected: FAIL — no "Hafta" view button, no "Tür" filter, no "12 Ekim için etkinlik ekle" button, no drawer.

- [ ] **Step 3: Implement**

Replace `frontend/src/components/CalendarView.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { getCalendarEvents, getCases, getMe, listUsers } from "@/lib/api";
import {
  MONTH_NAMES,
  addDays,
  agendaRange,
  filterCalendarItems,
  monthFromKey,
  monthKey,
  monthRange,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekRange,
} from "@/lib/calendar";
import { parseCalendarQuery, type CalendarViewSlug } from "@/lib/filters";
import { useUrlParams } from "@/lib/urlState";
import type { AppUser, CalendarEvent, Case } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { CalendarAgendaView } from "@/components/calendar/CalendarAgendaView";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventForm, eventFormInitialFromItem, type EventFormInitial } from "@/components/calendar/CalendarEventForm";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";

type ParamUpdates = Record<string, string | null>;

const VIEW_LABELS: Record<CalendarViewSlug, string> = { ay: "Ay", hafta: "Hafta", ajanda: "Ajanda" };
const NAV_BUTTON =
  "grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted";

function weekTitle(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = weekStart.getMonth() === weekEnd.getMonth() ? "" : ` ${MONTH_NAMES[weekStart.getMonth()]}`;
  return `${weekStart.getDate()}${startMonth} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
}

export function CalendarView() {
  const { params, setParams } = useUrlParams();
  // The URL is mirrored into local state so the page reacts immediately
  // (and so tests with a static mocked URL can still navigate).
  const [search, setSearch] = useState(() => params.toString());
  const query = useMemo(() => parseCalendarQuery(new URLSearchParams(search)), [search]);
  const view: CalendarViewSlug = query.gorunum ?? "ay";

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const visibleMonth = monthFromKey(query.ay) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const weekStart = startOfWeek(query.hafta ? parseDateKey(query.hafta) : today);
  const range = view === "ay" ? monthRange(visibleMonth) : view === "hafta" ? weekRange(weekStart) : agendaRange(today);

  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [me, setMe] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<EventFormInitial | null>(null);

  useEffect(() => {
    // Filters and the form still work (with empty lists) if these fail.
    Promise.all([getMe(), listUsers(), getCases()])
      .then(([meResult, usersResult, casesResult]) => {
        setMe(meResult);
        setUsers(usersResult);
        setCases(casesResult);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCalendarEvents({ from: range.from, to: range.to })
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadToken]);

  const shown = useMemo(() => filterCalendarItems(items, query, me?.id ?? null), [items, query, me]);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function update(updates: ParamUpdates) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearch(next.toString());
    setParams(updates);
  }

  const reload = () => setReloadToken((token) => token + 1);

  function changePeriod(delta: number) {
    if (view === "ay") {
      update({ ay: monthKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1)) });
    } else {
      update({ hafta: toDateKey(addDays(weekStart, delta * 7)) });
    }
  }

  function goToToday() {
    update(view === "ay" ? { ay: null } : { hafta: null });
  }

  function openCreate(date: string, time?: string) {
    setFormInitial({ date, time: time ?? "09:00" });
  }

  if (!loaded) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const monthItems = items.filter((item) => item.date.startsWith(monthKey(visibleMonth)));
  const periodTitle =
    view === "ay" ? `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}` : view === "hafta" ? weekTitle(weekStart) : "Önümüzdeki 30 gün";
  const unit = view === "ay" ? "ay" : "hafta";

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Takvim</h1>
          <p className="text-sm text-navy-500">Duruşma, görev ve etkinliklerinizi takip edin; e-posta hatırlatmalarını ayarlayın.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate(todayKey)}
          className="h-9 rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition hover:bg-accent-700"
        >
          Yeni etkinlik
        </button>
      </div>

      <CalendarFilters query={query} users={users} cases={cases} onChange={update} />

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-b border-surface-border px-5 py-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold text-navy-900">{periodTitle}</h2>
            {view === "ay" && (
              <p className="mt-0.5 text-xs text-navy-500">
                Bu ay {monthItems.filter((item) => item.event_type === "hearing").length} duruşma,{" "}
                {monthItems.filter((item) => item.kind === "task").length} görev ve{" "}
                {monthItems.filter((item) => item.kind === "event" && item.event_type !== "hearing").length} etkinlik bulunuyor.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Görünüm" className="flex rounded-lg border border-surface-border p-0.5">
              {(Object.keys(VIEW_LABELS) as CalendarViewSlug[]).map((slug) => (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={view === slug}
                  onClick={() => update({ gorunum: slug === "ay" ? null : slug })}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    view === slug ? "bg-accent-600 text-white" : "text-navy-600 hover:bg-surface-muted"
                  }`}
                >
                  {VIEW_LABELS[slug]}
                </button>
              ))}
            </div>
            {view !== "ajanda" && (
              <>
                <button type="button" onClick={() => changePeriod(-1)} aria-label={`Önceki ${unit}`} className={NAV_BUTTON}>
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 rounded-lg border border-surface-border px-4 text-xs font-medium text-navy-700 transition hover:bg-surface-muted"
                >
                  Bugün
                </button>
                <button type="button" onClick={() => changePeriod(1)} aria-label={`Sonraki ${unit}`} className={NAV_BUTTON}>
                  ›
                </button>
              </>
            )}
          </div>
        </div>

        {view === "ay" && (
          <CalendarMonthView month={visibleMonth} items={shown} todayKey={todayKey} onSelect={(item) => setSelectedId(item.id)} onCreate={openCreate} />
        )}
        {view === "hafta" && (
          <CalendarWeekView weekStart={weekStart} items={shown} todayKey={todayKey} onSelect={(item) => setSelectedId(item.id)} onCreate={openCreate} />
        )}
        {view === "ajanda" && <CalendarAgendaView today={today} items={shown} onSelect={(item) => setSelectedId(item.id)} />}

        {view !== "ajanda" && items.length === 0 && (
          <p className="border-t border-surface-border px-5 py-4 text-center text-sm text-navy-500">
            Takvimde bu dönem için kayıt yok. Yeni etkinlik ekleyebilir veya bir davaya duruşma ya da görev tarihi girebilirsiniz.
          </p>
        )}
      </section>

      {selected && (
        <CalendarEventDrawer
          item={selected}
          onClose={() => setSelectedId(null)}
          onEdit={(item) => {
            setSelectedId(null);
            setFormInitial(eventFormInitialFromItem(item));
          }}
          onChanged={reload}
        />
      )}

      {formInitial && (
        <CalendarEventForm
          initial={formInitial}
          cases={cases}
          users={users}
          onClose={() => setFormInitial(null)}
          onSaved={() => {
            setFormInitial(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step: Commit**

```bash
git add frontend/src/components/CalendarView.tsx frontend/src/components/__tests__/CalendarView.test.tsx
git commit -F - <<'EOF'
feat(web): interactive calendar with views, filters, event form and detail drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 10: Settings — "Bildirimler" section with test e-mail

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`
- Test: `frontend/src/components/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `getNotificationStatus()`, `sendTestEmail()` (Task 6), `/notifications/*` (Task 1).
- Produces: a `section` labelled "Bildirimler" showing "E-posta yöntemi" (`SMTP` / `Konsol (yalnızca sunucu logu)`), "Hatırlatmalar" (`Açık — her gün 09:00'dan sonra (Europe/Istanbul)` / `Kapalı`) and a "Test e-postası gönder" button with success (`Test e-postası <e-posta> adresine gönderildi.` or console text) and error (`role="alert"`, API detail) feedback.

- [ ] **Step 1: Write the failing tests**

Apply to `frontend/src/components/__tests__/SettingsView.test.tsx`:

```diff
diff --git a/frontend/src/components/__tests__/SettingsView.test.tsx b/frontend/src/components/__tests__/SettingsView.test.tsx
--- a/frontend/src/components/__tests__/SettingsView.test.tsx
+++ b/frontend/src/components/__tests__/SettingsView.test.tsx
@@ -4,13 +4,20 @@ import { render, screen, waitFor } from "@testing-library/react";
 const getMe = vi.fn();
 const listUsers = vi.fn();
 const getAiStatus = vi.fn();
+const getNotificationStatus = vi.fn();
+const sendTestEmail = vi.fn();
 
 vi.mock("@/lib/api", () => ({
   getMe: (...args: unknown[]) => getMe(...args),
   listUsers: (...args: unknown[]) => listUsers(...args),
   getAiStatus: (...args: unknown[]) => getAiStatus(...args),
+  getNotificationStatus: (...args: unknown[]) => getNotificationStatus(...args),
+  sendTestEmail: (...args: unknown[]) => sendTestEmail(...args),
 }));
 
+import userEvent from "@testing-library/user-event";
+import { ApiError } from "@/lib/apiError";
+
 import { SettingsView } from "@/components/SettingsView";
 
 const adminUser = {
@@ -29,6 +36,9 @@ beforeEach(() => {
   listUsers.mockReset();
   getAiStatus.mockReset();
   getAiStatus.mockResolvedValue({ provider: "mock", configured: true, error: null });
+  getNotificationStatus.mockReset();
+  sendTestEmail.mockReset();
+  getNotificationStatus.mockResolvedValue({ email_backend: "smtp", reminders_enabled: true, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
 });
 
 describe("SettingsView", () => {
@@ -51,4 +61,38 @@ describe("SettingsView", () => {
     await waitFor(() => expect(screen.getByText(/sadece yöneticiler/i)).toBeInTheDocument());
     expect(screen.queryByText("Avukat Kullanici")).not.toBeInTheDocument();
   });
+
+  it("shows the notification settings and sends a test e-mail", async () => {
+    getMe.mockResolvedValue(lawyerUser);
+    listUsers.mockResolvedValue([lawyerUser]);
+    sendTestEmail.mockResolvedValue({ sent: true, backend: "smtp" });
+
+    render(<SettingsView />);
+
+    const section = await screen.findByRole("region", { name: "Bildirimler" });
+    expect(section).toHaveTextContent("E-posta yöntemiSMTP");
+    expect(section).toHaveTextContent("Açık — her gün 09:00'dan sonra (Europe/Istanbul)");
+    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
+
+    expect(await screen.findByText("Test e-postası admin@demo.casebridge.dev adresine gönderildi.")).toBeInTheDocument();
+    expect(sendTestEmail).toHaveBeenCalledTimes(1);
+  });
+
+  it("explains console mode and shows SMTP errors", async () => {
+    getMe.mockResolvedValue(lawyerUser);
+    listUsers.mockResolvedValue([lawyerUser]);
+    getNotificationStatus.mockResolvedValue({ email_backend: "console", reminders_enabled: false, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
+    sendTestEmail.mockResolvedValueOnce({ sent: true, backend: "console" });
+    sendTestEmail.mockRejectedValueOnce(new ApiError("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.", 502));
+
+    render(<SettingsView />);
+
+    const section = await screen.findByRole("region", { name: "Bildirimler" });
+    expect(section).toHaveTextContent("Konsol (yalnızca sunucu logu)");
+    expect(section).toHaveTextContent("Kapalı");
+    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
+    expect(await screen.findByText("Test e-postası sunucu loguna yazıldı (konsol modu).")).toBeInTheDocument();
+    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
+    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.");
+  });
 });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx`
Expected: the two new tests FAIL (no "Bildirimler" region).

- [ ] **Step 3: Implement**

Apply to `frontend/src/components/SettingsView.tsx`:

```diff
diff --git a/frontend/src/components/SettingsView.tsx b/frontend/src/components/SettingsView.tsx
--- a/frontend/src/components/SettingsView.tsx
+++ b/frontend/src/components/SettingsView.tsx
@@ -2,33 +2,58 @@
 
 import { useEffect, useState } from "react";
 
-import { getAiStatus, getMe, listUsers } from "@/lib/api";
-import type { AIStatus, AppUser } from "@/types";
+import { getAiStatus, getMe, getNotificationStatus, listUsers, sendTestEmail } from "@/lib/api";
+import type { AIStatus, AppUser, NotificationStatus } from "@/types";
 import { LoadingState } from "@/components/LoadingState";
 import { ErrorState } from "@/components/ErrorState";
 
 const ROLE_LABELS: Record<string, string> = { admin: "Yönetici", lawyer: "Avukat" };
+const EMAIL_BACKEND_LABELS: Record<NotificationStatus["email_backend"], string> = {
+  smtp: "SMTP",
+  console: "Konsol (yalnızca sunucu logu)",
+};
+
+type TestEmailState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };
 
 export function SettingsView() {
   const [me, setMe] = useState<AppUser | null>(null);
   const [users, setUsers] = useState<AppUser[]>([]);
   const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
+  const [notifications, setNotifications] = useState<NotificationStatus | null>(null);
+  const [testEmail, setTestEmail] = useState<TestEmailState>({ kind: "idle" });
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
 
   useEffect(() => {
     setLoading(true);
     setError(null);
-    Promise.all([getMe(), listUsers(), getAiStatus()])
-      .then(([meResult, usersResult, aiStatusResult]) => {
+    Promise.all([getMe(), listUsers(), getAiStatus(), getNotificationStatus()])
+      .then(([meResult, usersResult, aiStatusResult, notificationResult]) => {
         setMe(meResult);
         setUsers(usersResult);
         setAiStatus(aiStatusResult);
+        setNotifications(notificationResult);
       })
       .catch(() => setError("Ayarlar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
       .finally(() => setLoading(false));
   }, []);
 
+  async function sendTest() {
+    setTestEmail({ kind: "sending" });
+    try {
+      const result = await sendTestEmail();
+      setTestEmail({
+        kind: "done",
+        message:
+          result.backend === "console"
+            ? "Test e-postası sunucu loguna yazıldı (konsol modu)."
+            : `Test e-postası ${me?.email ?? "hesabınıza"} adresine gönderildi.`,
+      });
+    } catch (err) {
+      setTestEmail({ kind: "error", message: err instanceof Error ? err.message : "E-posta gönderilemedi." });
+    }
+  }
+
   if (loading) return <LoadingState />;
   if (error) return <ErrorState message={error} />;
 
@@ -58,6 +83,44 @@ export function SettingsView() {
         )}
       </div>
 
+      {notifications && (
+        <section aria-labelledby="settings-notifications" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
+          <h2 id="settings-notifications" className="mb-3 text-sm font-medium text-navy-700">
+            Bildirimler
+          </h2>
+          <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
+            <dt className="text-navy-500">E-posta yöntemi</dt>
+            <dd className="text-navy-800">{EMAIL_BACKEND_LABELS[notifications.email_backend]}</dd>
+            <dt className="text-navy-500">Hatırlatmalar</dt>
+            <dd className="text-navy-800">
+              {notifications.reminders_enabled
+                ? `Açık — her gün ${String(notifications.reminder_send_hour).padStart(2, "0")}:00'dan sonra (${notifications.timezone})`
+                : "Kapalı"}
+            </dd>
+          </dl>
+          <div className="mt-4 flex flex-wrap items-center gap-3">
+            <button
+              type="button"
+              onClick={sendTest}
+              disabled={testEmail.kind === "sending"}
+              className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-60"
+            >
+              {testEmail.kind === "sending" ? "Gönderiliyor..." : "Test e-postası gönder"}
+            </button>
+            {testEmail.kind === "done" && (
+              <p role="status" className="text-sm text-emerald-700">
+                {testEmail.message}
+              </p>
+            )}
+            {testEmail.kind === "error" && (
+              <p role="alert" className="text-sm text-red-700">
+                {testEmail.message}
+              </p>
+            )}
+          </div>
+        </section>
+      )}
+
       <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
         <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
         {isAdmin ? (
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx && npx tsc --noEmit`
Expected: 4 passed, no type errors.

- [ ] **Step: Commit**

```bash
git add frontend/src/components/SettingsView.tsx frontend/src/components/__tests__/SettingsView.test.tsx
git commit -F - <<'EOF'
feat(web): notification settings with test e-mail button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

---

### Task 11: E2E flow, full verification and visual check

**Files:**
- Create: `tests/e2e/specs/08-calendar.spec.ts`
- Fix only real problems found by the full run.

**Interfaces:**
- Consumes: the whole feature. The E2E backend runs with `ENV` unset (development), so the reminder worker starts with `EMAIL_BACKEND=console` and only logs; no SMTP is needed.

- [ ] **Step 1: Write the E2E spec**

Create `tests/e2e/specs/08-calendar.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

// Flow 8: Takvim — add an event from the week view, see it in the hour
// grid, change its reminders in the detail drawer, then delete it.

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("add an event from the week view, change its reminders and delete it", async ({ page }) => {
  const title = `E2E Müvekkil Toplantısı ${Date.now()}`;
  await login(page, DEMO_LAWYER);
  await page.goto("/takvim?gorunum=hafta");
  await expect(page.getByRole("heading", { level: 1, name: "Takvim" })).toBeVisible();

  await page.getByRole("button", { name: "Yeni etkinlik" }).click();
  const form = page.getByRole("dialog", { name: "Yeni etkinlik" });
  await form.getByLabel("Başlık").fill(title);
  await form.getByLabel("Tür").selectOption({ label: "Müvekkil görüşmesi" });
  await form.getByLabel("Tarih").fill(localDateKey(new Date()));
  await form.getByLabel("Saat").fill("10:00");
  await form.getByLabel("Süre (dakika)").fill("90");
  await form.getByLabel("Konum").fill("Büro toplantı odası");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);

  const chip = page.getByTestId(`day-${localDateKey(new Date())}`).getByRole("button", { name: new RegExp(title) });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("10:00");

  await chip.click();
  const drawer = page.getByRole("dialog", { name: title });
  await expect(drawer).toContainText("10:00 – 11:30");
  await expect(drawer).toContainText("1 gün önce");
  await drawer.getByRole("button", { name: "Hatırlatmayı değiştir" }).click();
  await drawer.getByLabel("7 gün önce").check();
  await drawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(drawer).toContainText("7 gün önce, 1 gün önce");

  await drawer.getByRole("button", { name: "Sil" }).click();
  await drawer.getByRole("button", { name: "Evet, sil" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

Run: `cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test specs/08-calendar.spec.ts`
Expected: 1 passed (backend log shows "Reminder worker thread started.").

- [ ] **Step 3: Run everything**

```bash
cd backend && source .venv/bin/activate && pytest -q && cd ..
cd frontend && npx vitest run && npx tsc --noEmit && npm run build && cd ..
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test && cd ../..
```

Expected: all green (backend ≈ 430 passed, frontend ≈ 233 passed, all E2E specs pass). If a single E2E spec fails with a login 429, re-run once and report it.

- [ ] **Step 4: Visual check** — with the E2E servers (or `npm run dev` + backend), screenshot at 1440px and at 390px: `/takvim` (month, with a few events), `/takvim?gorunum=hafta` (timed chips sit in the right hour rows, all-day row above), `/takvim?gorunum=ajanda` ("Bugün"/"Bu hafta" badges), the add form modal, the detail drawer, and `/ayarlar` (Bildirimler section). Check: no horizontal page scroll outside the calendar's own scroll area, Turkish copy everywhere, no `navy-50…400` classes (`grep -rn "navy-[1-4]00\|navy-50\b" frontend/src/components/calendar frontend/src/components/CalendarView.tsx` → no output).

- [ ] **Step 5: Optional Mailpit check** (only if Docker is available): `docker compose up -d mailpit backend`, open Ayarlar → "Test e-postası gönder", confirm the message at http://localhost:8025.

- [ ] **Step: Commit**

```bash
git add tests/e2e/specs/08-calendar.spec.ts
git commit -F - <<'EOF'
test(e2e): add, view, re-remind and delete a calendar event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

If Step 3/4 required fixes, commit them separately (`fix: …`) with the same trailer.

---

## Self-Review (against the spec)

**1. Spec coverage**

| Spec | Task |
|---|---|
| §2 Interaction: add from calendar, week + agenda, filters, detail panel | 7, 8, 9 |
| §2/§3.1 `calendar_events` table, fields, limits, firm scoping, same-firm case/assignee | 2 |
| §3.1 hearing event → `next_hearing_date` (today or later; empty or later date) | 2 |
| §3.1 hide case hearing when a same-day hearing event exists | 3 (list), 4 (reminders) |
| §3.2 `tasks.reminder_days` (NULL → `[1]`) | 2, 3, 4 |
| §3.3 `reminder_deliveries` + unique key; date change → new reminder | 4 |
| §4.1 e-mail layer, console/smtp, STARTTLS, login, timeout, settings, password never logged | 1 |
| §4.2 `collect_due(now_local)`, sources, due rule, catch-up, past skipped, send hour, recipients, retries; `send_due` | 4 |
| §4.2 worker, poll interval, `REMINDERS_ENABLED`, not in tests, `APP_TIMEZONE` | 5 (settings in 1) |
| §4.3 Turkish subject/body/links/footer, text + HTML | 4 |
| §4.4 test e-mail endpoint 200/502 | 1 (UI in 10) |
| §4.5 Mailpit + backend env lines | 5 |
| §5 API table: `GET /calendar` range + unified fields + legacy fields; events CRUD; `PATCH /tasks/{id}` with `reminder_days`; test e-mail | 1, 2, 3 |
| §6 views and URL params, empty-day/slot click to add, agenda highlights, filters incl. legacy `goster` | 6, 7, 9 |
| §6 form fields incl. case search + reminder choices; drawer actions per kind | 8, 9 |
| §6 Settings "Bildirimler" | 10 |
| §7 backend, reminder, e-mail, frontend tests; E2E add → week → change reminder → delete | 1–11 |

**2. Placeholder scan** — every code step contains the full code or an exact diff; no TBD/TODO; commands have expected results.

**3. Type consistency** — checked across tasks: `CalendarItemOut` (T2 rename, T3 fields) ↔ TS `CalendarEvent`; `CalendarEventPayload` ↔ `CalendarEventCreate/Update`; `ReminderService(db, sender=None)` / `send_due` ↔ `run_reminder_tick`; `DueReminder` ↔ `build_reminder_email`; `EmailTestOut` ↔ `TestEmailResult`; `NotificationStatusOut` ↔ `NotificationStatus`; `updateTaskReminders` ↔ `PATCH /tasks/{id}`; `TYPE_DOTS` (T7) used by the drawer (T8); `eventFormInitialFromItem` (T8) used by `CalendarView` (T9). The code in this plan was run end to end on a scratch copy of the branch: backend 430 passed, frontend 233 passed, `tsc` clean, and the new E2E spec passed.

**Resolved spec ambiguities (decisions made in this plan)**
- Settings shows the "e-posta yöntemi" before anything is sent, but the spec has no endpoint for it, so the plan adds a read-only `GET /notifications/status` (backend, enabled flag, send hour, time zone; no host and no secrets).
- `PATCH /tasks/{id}` did not exist (only `/cases/{case}/tasks/{task}`), so the plan adds it on the firm-wide tasks router. `reminder_days` is accepted on both routes; `null` resets to the default.
- Catch-up: when several offsets of one occurrence are due at once, ONE e-mail is sent and every offset is recorded. The day phrase uses the real days left (`D − today`), not `d`.
- Case hearings have no creator, so a case without `assigned_lawyer_id` gets no hearing reminder. Archived cases get no hearing reminders but still appear in the calendar, as they do today.
- Event `reminder_days` omitted on create → type default; on PATCH, `null` for required fields (incl. `reminder_days`) → 422. All-day events are stored at 00:00; aware datetimes are converted to `APP_TIMEZONE`.
- `GET /calendar` rejects `from > to` and ranges over 400 days (422). Existing calendar tests pin `from/to`, because the new default window would make their fixed dates drift.
- Week view: overlapping timed events are drawn on top of each other (no column split; MVP). Clicking an item opens the drawer instead of the case quick view. "Göreve git" opens the case's Görevler tab.
- The Compose e-mail defaults (`smtp`/`mailpit`) would be overridden by an uncommented `.env`, so the e-mail lines in `.env.example` are commented out. `tzdata` is added to the Dockerfile's apt line (an OS package, not a Python one).
- Two migrations (`e2a4c6b8d0f1` calendar events + task column, `f3b5d7e9a1c2` reminder deliveries) so Tasks 2 and 4 each ship their own schema.
