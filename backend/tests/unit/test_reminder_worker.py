"""Reminder worker: start condition, one tick, loop resilience."""
import threading
from datetime import datetime

from app.core.config import settings
from app.services import reminder_worker
from app.services.reminder_worker import (
    HearingRecomputeSchedule,
    run_reminder_tick,
    run_reminder_worker_loop,
    should_start_reminder_worker,
)


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

    def tick(session_factory, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database hiccup")
        stop.set()

    monkeypatch.setattr(reminder_worker, "run_reminder_tick", tick)

    run_reminder_worker_loop(0.001, stop_event=stop)

    assert len(calls) == 2


# ----- the nightly next_hearing_date pass -----


def _own_sessions(db_session):
    """A tick closes the session it is given; hand it fresh ones on the test's connection."""
    from sqlalchemy.orm import sessionmaker

    return sessionmaker(bind=db_session.get_bind())


def _case_with_two_hearings(db_session):
    from app.models.calendar import CalendarEvent, CalendarEventType
    from app.models.case import Case, CaseType
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="avukat@a.test", hashed_password="x", full_name="Avukat",
                role=UserRole.LAWYER, is_active=True)
    db_session.add(user)
    db_session.flush()
    case = Case(law_firm_id=firm.id, case_number="2026/1", case_name="Dava", client_name="M", case_type=CaseType.KIRA,
                assigned_lawyer_id=user.id, next_hearing_date=datetime(2026, 10, 2).date())
    db_session.add(case)
    db_session.flush()
    for starts_at in (datetime(2026, 10, 2, 10, 0), datetime(2026, 10, 20, 10, 0)):
        db_session.add(CalendarEvent(law_firm_id=firm.id, title="Duruşma", event_type=CalendarEventType.HEARING,
                                     starts_at=starts_at, all_day=False, duration_minutes=60, case_id=case.id,
                                     created_by=user.id, reminder_days=[]))
    db_session.commit()
    return case


def test_the_first_tick_of_each_local_day_moves_next_hearing_dates_on(db_session, monkeypatch):
    case = _case_with_two_hearings(db_session)
    passes = []
    real = reminder_worker.recompute_open_cases
    monkeypatch.setattr(reminder_worker, "recompute_open_cases", lambda db, today: passes.append(today) or real(db, today))
    factory = _own_sessions(db_session)
    schedule = HearingRecomputeSchedule()

    # Midnight is before the send hour: the recompute does not wait for it.
    run_reminder_tick(factory, now_local=datetime(2026, 10, 2, 0, 10), hearing_schedule=schedule)
    run_reminder_tick(factory, now_local=datetime(2026, 10, 2, 9, 15), hearing_schedule=schedule)
    db_session.refresh(case)
    assert (passes, case.next_hearing_date) == ([datetime(2026, 10, 2).date()], datetime(2026, 10, 2).date())

    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 0, 10), hearing_schedule=schedule)
    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 15), hearing_schedule=schedule)
    db_session.refresh(case)
    assert passes == [datetime(2026, 10, 2).date(), datetime(2026, 10, 3).date()]
    assert case.next_hearing_date == datetime(2026, 10, 20).date()


def test_a_failed_pass_is_retried_and_never_stops_the_reminders(db_session, monkeypatch):
    case = _case_with_two_hearings(db_session)
    real = reminder_worker.recompute_open_cases
    attempts = []

    def flaky(db, today):
        attempts.append(today)
        if len(attempts) == 1:
            raise RuntimeError("database hiccup")
        return real(db, today)

    monkeypatch.setattr(reminder_worker, "recompute_open_cases", flaky)
    factory = _own_sessions(db_session)
    schedule = HearingRecomputeSchedule()

    first = run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 0), hearing_schedule=schedule)
    assert first.sent == 0 and schedule.last_day is None
    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 15), hearing_schedule=schedule)

    db_session.refresh(case)
    assert (len(attempts), schedule.last_day, case.next_hearing_date) == (2, datetime(2026, 10, 3).date(), datetime(2026, 10, 20).date())


def test_the_loop_passes_one_schedule_to_every_tick(monkeypatch):
    stop = threading.Event()
    schedules = []

    def tick(session_factory, hearing_schedule=None):
        schedules.append(hearing_schedule)
        if len(schedules) == 2:
            stop.set()

    monkeypatch.setattr(reminder_worker, "run_reminder_tick", tick)

    run_reminder_worker_loop(0.001, stop_event=stop)

    assert isinstance(schedules[0], HearingRecomputeSchedule) and schedules[0] is schedules[1]
