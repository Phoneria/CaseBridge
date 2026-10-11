"""Closing, reopening and archiving a case.

HTTP-agnostic like the other services: a broken rule raises CaseStateError and
the route turns it into the response. "today" is passed in by the route (the
application time zone, like the calendar), so the rules are testable.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus
from app.schemas.case import CaseClose

OUTCOME_LABELS = {
    CaseOutcome.WON: "Kazanıldı",
    CaseOutcome.LOST: "Kaybedildi",
    CaseOutcome.SETTLED: "Sulh",
}


class CaseStateError(Exception):
    """A lifecycle rule was broken; carries the HTTP status and the Turkish message."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class CaseLifecycleService:
    def __init__(self, db: Session):
        self.db = db

    def _save(self, case: Case, event: Optional[CaseEvent] = None) -> Case:
        """The case and its timeline event are committed together."""
        self.db.add(case)
        if event is not None:
            self.db.add(event)
        self.db.commit()
        self.db.refresh(case)
        return case

    def close(self, case: Case, payload: CaseClose, closed_by: str, today: date) -> Case:
        if case.status == CaseStatus.KAPALI:
            raise CaseStateError(409, "Dava zaten kapalı.")
        if payload.decision_date > today:
            raise CaseStateError(422, "Karar tarihi ileri bir tarih olamaz.")
        outcome = CaseOutcome(payload.outcome)
        case.status = CaseStatus.KAPALI
        case.outcome = outcome
        case.decision_date = payload.decision_date
        case.closing_note = payload.note
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            event_date=payload.decision_date,
            title=f"Dava kapatıldı — {OUTCOME_LABELS[outcome]}",
            description=payload.note,
            event_type=CaseEventType.OTHER,
            created_by=closed_by,
        )
        return self._save(case, event)

    def reopen(self, case: Case, reopened_by: str, today: date) -> Case:
        if case.status != CaseStatus.KAPALI:
            raise CaseStateError(409, "Dava zaten açık.")
        case.status = CaseStatus.DEVAM_EDEN
        case.outcome = CaseOutcome.ONGOING
        case.decision_date = None
        case.closing_note = None
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            event_date=today,
            title="Dava yeniden açıldı",
            description=None,
            event_type=CaseEventType.OTHER,
            created_by=reopened_by,
        )
        return self._save(case, event)

    def archive(self, case: Case) -> Case:
        """Idempotent: an archived case is returned as it is. Only closed cases are archived."""
        if case.is_archived:
            return case
        if case.status != CaseStatus.KAPALI:
            raise CaseStateError(409, "Yalnızca kapalı davalar arşivlenebilir.")
        case.is_archived = True
        return self._save(case)

    def unarchive(self, case: Case) -> Case:
        """Idempotent: a case that is not archived is returned as it is."""
        if not case.is_archived:
            return case
        case.is_archived = False
        return self._save(case)
