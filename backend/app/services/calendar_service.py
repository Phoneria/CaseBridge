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
