"""Calendar events (CRUD) and the firm-wide calendar list.

Every query is scoped by law_firm_id. A referenced case or assignee from
another firm is reported as "not found" (404), never as "forbidden".
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.timeutil import to_local_naive
from app.domain.calendar import default_event_reminder_days, task_reminder_days
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseStatus
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.repositories.case_repository import CaseRepository
from app.services.assignees import find_assignable_in_firm
from app.services.hearing_dates import recompute_next_hearing
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarItemOut


class CalendarReferenceNotFound(Exception):
    """A referenced case or user is not in the caller's firm."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


CLOSED_CASE_HEARING = "Kapalı davaya duruşma eklenemez."


class ClosedCaseHearing(Exception):
    """A hearing may not be added to (or moved onto) a closed case."""

    detail = CLOSED_CASE_HEARING


class CalendarService:
    def __init__(self, db: Session):
        self.db = db

    # ----- events -----

    def create_event(
        self, law_firm_id: str, created_by: str, payload: CalendarEventCreate, today: date
    ) -> CalendarEvent:
        case = self._check_references(law_firm_id, payload.case_id, payload.assignee_id)
        if case is not None and payload.event_type == CalendarEventType.HEARING:
            require_case_open_for_hearing(case)
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
        if case is not None and event.event_type == CalendarEventType.HEARING:
            recompute_next_hearing(self.db, case, today)
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
        # Only a new assignee is checked: an event whose assignee was
        # deactivated since can still be edited.
        new_assignee = updates.get("assignee_id") if updates.get("assignee_id") != event.assignee_id else None
        self._check_references(event.law_firm_id, updates.get("case_id"), new_assignee)
        new_type = updates.get("event_type", event.event_type)
        new_case_id = updates["case_id"] if "case_id" in updates else event.case_id
        held_hearing_of = event.case_id if event.event_type == CalendarEventType.HEARING else None
        becomes_hearing_of = new_case_id if new_type == CalendarEventType.HEARING else None
        if becomes_hearing_of is not None and becomes_hearing_of != held_hearing_of:
            # A new hearing for this case (new link or new type): the case must still be open.
            target = self._case_in_firm(becomes_hearing_of, event.law_firm_id)
            if target is not None:
                require_case_open_for_hearing(target)
        for field, value in updates.items():
            setattr(event, field, value)
        event.starts_at = _normalize_start(event.starts_at, event.all_day)
        # Both the case the hearing leaves and the one it now belongs to need a new cache value.
        affected = {held_hearing_of, becomes_hearing_of} - {None}
        for case_id in sorted(affected):
            case = self._case_in_firm(case_id, event.law_firm_id)
            if case is not None:
                recompute_next_hearing(self.db, case, today)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete_event(self, event: CalendarEvent, today: date) -> None:
        held_hearing_of = event.case_id if event.event_type == CalendarEventType.HEARING else None
        self.db.delete(event)
        if held_hearing_of is not None:
            case = self._case_in_firm(held_hearing_of, event.law_firm_id)
            if case is not None:
                recompute_next_hearing(self.db, case, today)
        self.db.commit()

    # ----- calendar list -----

    def list_items(self, law_firm_id: str, start: date, end: date) -> list[CalendarItemOut]:
        """Events (hearings included) and pending task due dates with a date in [start, end]."""
        events = (
            self.db.query(CalendarEvent, Case.case_name, Case.is_archived)
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
                Case.is_precedent.is_(False),
                Task.status == TaskStatus.PENDING,
                Task.due_date >= start,
                Task.due_date <= end,
            )
            .all()
        )
        names = self._user_names(
            law_firm_id,
            {event.assignee_id for event, _, _ in events}
            | {task.assigned_to for task, _ in tasks},
        )

        # An event of an archived case is read-only (its writes answer 409);
        # task items are never editable here.
        items = [_event_item(event, case_name, names, not archived) for event, case_name, archived in events]
        items += [_task_item(task, case_name, names) for task, case_name in tasks]
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
        """Row-locked (a no-op on SQLite): the closed check and the cache recompute that follow
        must not interleave with closing the case or another hearing change."""
        return CaseRepository(self.db).get_by_id_in_firm_for_update(case_id, law_firm_id)

    def _check_references(
        self, law_firm_id: str, case_id: Optional[str], assignee_id: Optional[str]
    ) -> Optional[Case]:
        case = None
        if case_id is not None:
            case = self._case_in_firm(case_id, law_firm_id)
            if case is None:
                raise CalendarReferenceNotFound("Dava bulunamadı")
        # AssigneeNotAssignable (422) for a pending or inactive user.
        if assignee_id is not None and find_assignable_in_firm(self.db, assignee_id, law_firm_id) is None:
            raise CalendarReferenceNotFound("Kullanıcı bulunamadı")
        return case


def _event_item(
    event: CalendarEvent, case_name: Optional[str], names: dict[str, str], editable: bool = True
) -> CalendarItemOut:
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
        result_note=event.result_note,
        editable=editable,
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


def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
    local = to_local_naive(starts_at).replace(second=0, microsecond=0)
    if all_day:
        local = local.replace(hour=0, minute=0)
    return local


def require_case_open_for_hearing(case: Case) -> None:
    if case.status == CaseStatus.KAPALI:
        raise ClosedCaseHearing()
