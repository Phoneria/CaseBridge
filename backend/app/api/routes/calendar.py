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
