"""A case's hearings and the note written after one.

Hearings are calendar events of type "hearing" (see hearing_dates.py). Rules
that fail raise HearingRuleError; the route turns it into the response.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.calendar import HEARING_REMINDER_DAYS
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus
from app.repositories.case_repository import CaseRepository
from app.schemas.calendar import CaseHearingOut, HearingResultIn, HearingResultOut
from app.services.calendar_service import CLOSED_CASE_HEARING, normalize_start
from app.services.hearing_dates import recompute_next_hearing

NOT_A_CASE_HEARING = "Sonuç yalnızca davaya bağlı duruşmalara girilebilir."
NOT_YET_HELD = "Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir."


class HearingRuleError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def hearing_out(event: CalendarEvent, today: date) -> CaseHearingOut:
    day = event.starts_at.date()
    return CaseHearingOut(
        id=event.id,
        starts_at=event.starts_at,
        all_day=event.all_day,
        duration_minutes=event.duration_minutes,
        location=event.location,
        notes=event.notes,
        assignee_id=event.assignee_id,
        result_note=event.result_note,
        is_past=day < today,
        result_open=day <= today,
    )


class HearingService:
    def __init__(self, db: Session):
        self.db = db

    def list_for_case(self, case: Case, today: date) -> list[CaseHearingOut]:
        events = (
            self.db.query(CalendarEvent)
            .filter(
                CalendarEvent.law_firm_id == case.law_firm_id,
                CalendarEvent.case_id == case.id,
                CalendarEvent.event_type == CalendarEventType.HEARING,
            )
            .order_by(CalendarEvent.starts_at, CalendarEvent.created_at)
            .all()
        )
        return [hearing_out(event, today) for event in events]

    def record_result(
        self, event: CalendarEvent, payload: HearingResultIn, user_id: str, today: date
    ) -> HearingResultOut:
        """Store the note, write (or update) its timeline entry and, when asked, add the
        next hearing, all in one transaction. The caller has already answered 404 for an
        unknown event and 409 for an archived case."""
        if event.event_type != CalendarEventType.HEARING or event.case_id is None:
            raise HearingRuleError(422, NOT_A_CASE_HEARING)
        day = event.starts_at.date()
        if day > today:
            raise HearingRuleError(422, NOT_YET_HELD)
        case = CaseRepository(self.db).get_by_id_in_firm_for_update(event.case_id, event.law_firm_id)
        if case is None:
            raise HearingRuleError(422, NOT_A_CASE_HEARING)
        if payload.next_hearing is not None and case.status == CaseStatus.KAPALI:
            raise HearingRuleError(409, CLOSED_CASE_HEARING)

        event.result_note = payload.result_note
        entry = self._timeline_entry(event)
        if entry is None:
            entry = CaseEvent(
                case_id=case.id,
                law_firm_id=case.law_firm_id,
                event_date=day,
                title=f"Duruşma yapıldı — {day:%d.%m.%Y}",
                event_type=CaseEventType.HEARING,
                created_by=user_id,
            )
            self.db.add(entry)
        entry.description = payload.result_note
        self.db.flush()
        event.result_case_event_id = entry.id

        following: Optional[CalendarEvent] = None
        if payload.next_hearing is not None:
            following = CalendarEvent(
                law_firm_id=case.law_firm_id,
                title="Duruşma",
                event_type=CalendarEventType.HEARING,
                starts_at=normalize_start(payload.next_hearing.starts_at, payload.next_hearing.all_day),
                all_day=payload.next_hearing.all_day,
                duration_minutes=payload.next_hearing.duration_minutes,
                location=payload.next_hearing.location,
                notes=payload.next_hearing.notes,
                case_id=case.id,
                assignee_id=case.assigned_lawyer_id,
                created_by=user_id,
                reminder_days=list(HEARING_REMINDER_DAYS),
            )
            self.db.add(following)
        recompute_next_hearing(self.db, case, today)
        self.db.commit()
        self.db.refresh(event)
        if following is not None:
            self.db.refresh(following)
        return HearingResultOut(
            hearing=hearing_out(event, today),
            next_hearing=hearing_out(following, today) if following is not None else None,
        )

    def _timeline_entry(self, event: CalendarEvent) -> Optional[CaseEvent]:
        """The entry written for an earlier result; None when there is none or it was deleted."""
        if event.result_case_event_id is None:
            return None
        return (
            self.db.query(CaseEvent)
            .filter(CaseEvent.id == event.result_case_event_id, CaseEvent.case_id == event.case_id)
            .first()
        )
