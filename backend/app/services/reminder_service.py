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
  - a timed event that has already started gets no same-day (d=0) reminder;
  - each reminder is claimed in the ledger (status failed, "InFlight",
    attempts + 1) and committed BEFORE it is sent, then marked sent. Delivery
    is at-least-once: a crash or a failed final commit after a send can cause
    one resend (bounded by REMINDER_MAX_ATTEMPTS), which is preferred over a
    missed reminder;
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

from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
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
            offsets = due_offsets(candidate.occurrence_date, candidate.reminder_days, today)
            if candidate.source_type == ReminderSourceType.EVENT and candidate.starts_at is not None:
                if candidate.starts_at <= now_local:
                    offsets = [d for d in offsets if d != 0]
            offsets = self._pending_offsets(candidate, user.id, offsets)
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
            rows = self._claim(due)
            if rows is None:  # another worker claimed it, or the ledger is unavailable
                continue
            error: Optional[str] = None
            try:
                self.sender(build_reminder_email(due, today))
            except EmailSendError as exc:
                error = str(exc) or "EmailSendError"
            except Exception as exc:  # one bad reminder must not stop the rest
                error = type(exc).__name__
            if error is not None:
                logger.warning("Hatırlatma gönderilemedi (%s): %s", due.source_type.value, error)
            self._finish(rows, error)
            if error is None:
                sent += 1
            else:
                failed += 1
        return ReminderRunResult(sent=sent, failed=failed)

    # ----- candidates -----

    def _event_candidates(self, today: date, last_day: date) -> list[_Candidate]:
        rows = (
            self.db.query(CalendarEvent, Case.case_name)
            .outerjoin(Case, and_(CalendarEvent.case_id == Case.id, Case.law_firm_id == CalendarEvent.law_firm_id))
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
                case_id=event.case_id if case_name is not None else None,
                case_name=case_name,
            )
            for event, case_name in rows
        ]

    def _task_candidates(self, today: date, last_day: date) -> list[_Candidate]:
        rows = (
            self.db.query(Task, Case.case_name)
            .join(Case, and_(Task.case_id == Case.id, Case.law_firm_id == Task.law_firm_id))
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
            (law_firm_id, case_id, starts_at.date())
            for law_firm_id, case_id, starts_at in self.db.query(
                CalendarEvent.law_firm_id, CalendarEvent.case_id, CalendarEvent.starts_at
            )
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
            if (case.law_firm_id, case.id, case.next_hearing_date) not in hearing_event_days
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

    def _commit(self, what: str) -> bool:
        try:
            self.db.commit()
            return True
        except SQLAlchemyError as exc:
            self.db.rollback()
            logger.warning("Hatırlatma kaydı yazılamadı (%s): %s", what, type(exc).__name__)
            return False

    def _claim(self, due: DueReminder) -> Optional[list[ReminderDelivery]]:
        """Write the ledger rows (failed/InFlight, attempts + 1) before sending."""
        existing = self._deliveries(due.source_type, due.source_id, due.occurrence_date, due.recipient_id)
        rows = []
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
            row.status = ReminderDeliveryStatus.FAILED
            row.last_error = "InFlight"
            rows.append(row)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            logger.info("Hatırlatma başka bir işlem tarafından alındı (%s)", due.source_type.value)
            return None
        except SQLAlchemyError as exc:
            self.db.rollback()
            logger.warning("Hatırlatma kaydı yazılamadı (claim): %s", type(exc).__name__)
            return None
        return rows

    def _finish(self, rows: list[ReminderDelivery], error: Optional[str]) -> None:
        for row in rows:
            if error is None:
                row.status = ReminderDeliveryStatus.SENT
                row.last_error = None
                row.sent_at = datetime.now(timezone.utc)
            else:
                row.status = ReminderDeliveryStatus.FAILED
                row.last_error = error[:300]
        self._commit("final")
