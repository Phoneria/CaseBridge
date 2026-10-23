"""In-process reminder worker.

Like the simulation and courtroom workers: one daemon thread in the API
process that runs ReminderService.send_due every REMINDER_POLL_SECONDS
with its own DB session per tick. "Now" is computed in APP_TIMEZONE.
The first tick of every local day (and the first one after a start-up) also
recomputes cases.next_hearing_date of the open cases (HearingRecomputeSchedule),
so a date that has passed moves on to the case's next hearing.
Not started during automated tests (settings.env == "test") or when
REMINDERS_ENABLED=false. Single-instance only: two API processes would
each run a worker, and the unique constraint on reminder_deliveries is
then the only guard against a duplicate e-mail.
"""
import logging
import threading
from datetime import date, datetime
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import local_now
from app.db.session import SessionLocal
from app.services.hearing_dates import recompute_open_cases
from app.services.reminder_service import ReminderRunResult, ReminderService

logger = logging.getLogger("casebridge")


def should_start_reminder_worker() -> bool:
    return settings.env != "test" and settings.reminders_enabled


class HearingRecomputeSchedule:
    """Remembers the local day of the last successful recompute, so the pass runs
    once per day however often the worker ticks. A failed pass is not remembered
    and is tried again on the next tick."""

    def __init__(self) -> None:
        self.last_day: Optional[date] = None

    def run_if_new_day(self, session_factory: Callable[[], Session], today: date) -> Optional[int]:
        """Returns how many cases changed, or None when today's pass already ran."""
        if self.last_day == today:
            return None
        db = session_factory()
        try:
            changed = recompute_open_cases(db, today)
        finally:
            db.close()
        self.last_day = today
        if changed:
            logger.info("Sonraki duruşma tarihi %d davada yeniden hesaplandı.", changed)
        return changed


def run_reminder_tick(
    session_factory: Callable[[], Session] = SessionLocal,
    now_local: Optional[datetime] = None,
    hearing_schedule: Optional[HearingRecomputeSchedule] = None,
) -> ReminderRunResult:
    now = now_local or local_now()
    if hearing_schedule is not None:
        try:
            hearing_schedule.run_if_new_day(session_factory, now.date())
        except Exception:  # the reminders below must still go out
            logger.exception("Next hearing recompute failed")
    db = session_factory()
    try:
        result = ReminderService(db).send_due(now)
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
    hearing_schedule = HearingRecomputeSchedule()
    while not stop_event.is_set():
        try:
            run_reminder_tick(session_factory, hearing_schedule=hearing_schedule)
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
