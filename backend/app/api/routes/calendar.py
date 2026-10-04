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

from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.user import User
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarItemOut
from app.services.calendar_service import CalendarReferenceNotFound, CalendarService

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
    service.delete_event(_owned_event_or_404(service, event_id, law_firm_id), today=local_today())
    return Response(status_code=status.HTTP_204_NO_CONTENT)
