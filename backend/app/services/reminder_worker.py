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
