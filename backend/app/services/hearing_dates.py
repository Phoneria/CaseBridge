"""Hearing dates: one source of truth.

A hearing is a calendar event of type "hearing" linked to a case.
cases.next_hearing_date is only a cache of the date of the earliest such event
that is today or later (a hearing that is today still counts all day, whatever
its time: the rule is about dates, in APP_TIMEZONE, like the rest of the
calendar). Nothing writes the column except the functions of this module and
the nightly job that calls recompute_open_cases.

None of these functions commits, except recompute_open_cases (the nightly job's
pass), which commits once; for the others the caller owns the transaction.
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.domain.calendar import HEARING_REMINDER_DAYS
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, case_is_active


def _hearing_filter(today: date):
    return (
        CalendarEvent.event_type == CalendarEventType.HEARING,
        CalendarEvent.case_id.isnot(None),
        CalendarEvent.starts_at >= datetime.combine(today, time.min),
    )


def move_upcoming_hearings(
    db: Session, case: Case, previous_lawyer_id: Optional[str], new_lawyer_id: Optional[str], today: date
) -> int:
    """On reassignment, the case's hearings from today on that were the previous lawyer's
    (or nobody's) go to the new lawyer, so their reminders follow the case. Past hearings
    and hearings assigned to someone else stay. Does not commit."""
    if previous_lawyer_id == new_lawyer_id:
        return 0
    owner = CalendarEvent.assignee_id.is_(None)
    if previous_lawyer_id is not None:
        owner = or_(owner, CalendarEvent.assignee_id == previous_lawyer_id)
    return (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.law_firm_id == case.law_firm_id,
            CalendarEvent.case_id == case.id,
            CalendarEvent.event_type == CalendarEventType.HEARING,
            CalendarEvent.starts_at >= datetime.combine(today, time.min),
            owner,
        )
        .update({CalendarEvent.assignee_id: new_lawyer_id}, synchronize_session=False)
    )


def recompute_next_hearing(db: Session, case: Case, today: date) -> None:
    """Set case.next_hearing_date from the case's hearing events (call after the event change)."""
    db.flush()  # sessions here do not autoflush, and the query must see the pending event
    earliest = (
        db.query(func.min(CalendarEvent.starts_at))
        .filter(
            CalendarEvent.law_firm_id == case.law_firm_id,
            CalendarEvent.case_id == case.id,
            *_hearing_filter(today),
        )
        .scalar()
    )
    case.next_hearing_date = _as_date(earliest)


def recompute_open_cases(db: Session, today: date) -> int:
    """The nightly pass: recompute every case that is neither closed, archived nor a
    precedent (a closed or archived case keeps its stored value, see case_is_active).
    Commits; returns how many cases changed."""
    earliest = {
        case_id: _as_date(first)
        for case_id, first in db.query(CalendarEvent.case_id, func.min(CalendarEvent.starts_at))
        .filter(*_hearing_filter(today))
        .group_by(CalendarEvent.case_id)
        .all()
    }
    changed = 0
    for case in db.query(Case).filter(case_is_active(), Case.is_precedent.is_(False)).all():
        wanted = earliest.get(case.id)
        if case.next_hearing_date != wanted:
            case.next_hearing_date = wanted
            changed += 1
    db.commit()
    return changed


def add_all_day_hearing(db: Session, case: Case, day: date, created_by: str) -> CalendarEvent:
    """An all-day "Duruşma" for the case, assigned to its responsible lawyer, with the default hearing reminders."""
    event = CalendarEvent(
        law_firm_id=case.law_firm_id,
        title="Duruşma",
        event_type=CalendarEventType.HEARING,
        starts_at=datetime.combine(day, time.min),
        all_day=True,
        duration_minutes=60,
        case_id=case.id,
        assignee_id=case.assigned_lawyer_id,
        created_by=created_by,
        reminder_days=list(HEARING_REMINDER_DAYS),
    )
    db.add(event)
    return event


def ensure_all_day_hearing(db: Session, case: Case, day: date, created_by: str) -> Optional[CalendarEvent]:
    """add_all_day_hearing unless the case already has a hearing event on `day` (any time);
    returns the new event, or None when there was one. For the importer and the seed."""
    db.flush()
    taken = (
        db.query(CalendarEvent.id)
        .filter(
            CalendarEvent.law_firm_id == case.law_firm_id,
            CalendarEvent.case_id == case.id,
            CalendarEvent.event_type == CalendarEventType.HEARING,
            CalendarEvent.starts_at >= datetime.combine(day, time.min),
            CalendarEvent.starts_at < datetime.combine(day + timedelta(days=1), time.min),
        )
        .first()
    )
    if taken is not None:
        return None
    return add_all_day_hearing(db, case, day, created_by)


def _as_date(value: Optional[datetime]) -> Optional[date]:
    if value is None:
        return None
    # SQLite returns the min() of a DateTime column as text.
    return value.date() if isinstance(value, datetime) else datetime.fromisoformat(str(value)).date()
