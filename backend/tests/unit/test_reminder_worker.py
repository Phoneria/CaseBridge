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
