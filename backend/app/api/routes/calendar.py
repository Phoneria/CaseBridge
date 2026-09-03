"""Firm-wide calendar (Phase 4 - Takvim): merges case hearing dates
and task due dates into one chronological list. Replaces the
ComingSoon placeholder on app/takvim/page.tsx.

Not a new DB table - reads from Case.next_hearing_date and
Task.due_date, both already tenant-scoped, and sorts the union in
Python since the two source queries are cheap and small at MVP scale.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.models.case import Case
from app.models.task import Task, TaskStatus
from app.schemas.calendar import CalendarEventOut

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=list[CalendarEventOut])
def list_calendar_events(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    events: list[CalendarEventOut] = []

    hearings = (
        db.query(Case)
        .filter(Case.law_firm_id == law_firm_id, Case.next_hearing_date.isnot(None))
        .all()
    )
    for case in hearings:
        events.append(
            CalendarEventOut(
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
            CalendarEventOut(
                event_type="task",
                date=task.due_date,
                title=task.title,
                case_id=task.case_id,
                case_name=case_name,
            )
        )

    events.sort(key=lambda e: e.date)
    return events
