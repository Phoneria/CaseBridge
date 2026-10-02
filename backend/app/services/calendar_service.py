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
