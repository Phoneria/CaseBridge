"""Firm-wide calendar (Takvim).

GET /calendar merges calendar events, pending task due dates and case
hearing dates within a date range into one chronological list.
/calendar/events is CRUD for user-created events. Everything is scoped
to the caller's firm.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.case_access import require_case_id_writable
from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.user import User
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventOut,
    CalendarEventUpdate,
    CalendarItemOut,
    HearingResultIn,
    HearingResultOut,
)
from app.services.assignees import AssigneeNotAssignable
from app.services.calendar_service import CalendarReferenceNotFound, CalendarService, ClosedCaseHearing
from app.services.hearing_service import HearingRuleError, HearingService

router = APIRouter(prefix="/calendar", tags=["calendar"])

DEFAULT_PAST_DAYS = 31
DEFAULT_FUTURE_DAYS = 62
MAX_RANGE_DAYS = 400
EVENT_NOT_FOUND = "Etkinlik bulunamadı"


@router.get("", response_model=list[CalendarItemOut])
def list_calendar_items(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    today = local_today()
    start = from_date or today - timedelta(days=DEFAULT_PAST_DAYS)
    end = to_date or today + timedelta(days=DEFAULT_FUTURE_DAYS)
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Başlangıç tarihi bitiş tarihinden sonra olamaz.",
        )
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tarih aralığı en fazla {MAX_RANGE_DAYS} gün olabilir.",
        )
    return CalendarService(db).list_items(law_firm_id, start, end)


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
    require_case_id_writable(db, payload.case_id, current_user.law_firm_id)
    try:
        return CalendarService(db).create_event(
            current_user.law_firm_id, current_user.id, payload, today=local_today()
        )
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
    except ClosedCaseHearing as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail)
    except AssigneeNotAssignable as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)


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
    # Both the case the event belongs to and the case it is being moved to must be writable.
    require_case_id_writable(db, event.case_id, law_firm_id)
    require_case_id_writable(db, payload.case_id, law_firm_id)
    try:
        return service.update_event(event, payload, today=local_today())
    except CalendarReferenceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
    except ClosedCaseHearing as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail)
    except AssigneeNotAssignable as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar_event(
    event_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CalendarService(db)
    event = _owned_event_or_404(service, event_id, law_firm_id)
    require_case_id_writable(db, event.case_id, law_firm_id)
    service.delete_event(event, today=local_today())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/events/{event_id}/result", response_model=HearingResultOut)
def record_hearing_result(
    event_id: str,
    payload: HearingResultIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The note after a hearing, with an optional next hearing. 404 for another firm's
    event, 409 for an archived case, then the hearing rules (422, 409 for a closed case)."""
    event = _owned_event_or_404(CalendarService(db), event_id, current_user.law_firm_id)
    require_case_id_writable(db, event.case_id, current_user.law_firm_id)
    try:
        return HearingService(db).record_result(event, payload, current_user.id, today=local_today())
    except HearingRuleError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
