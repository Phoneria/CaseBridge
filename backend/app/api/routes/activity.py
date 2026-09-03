"""Firm-wide recent activity feed (Phase 4 - Dashboard "Son
Gelismeler"). Built from real CaseEvent rows across every case in the
firm, most-recently-created first. Replaces the previous hardcoded
EmptyState placeholder.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.repositories.case_event_repository import CaseEventRepository
from app.schemas.activity import ActivityItemOut

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=list[ActivityItemOut])
def list_recent_activity(
    limit: int = Query(default=10, ge=1, le=50),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    rows = CaseEventRepository(db).list_recent_for_firm(law_firm_id, limit=limit)
    return [
        ActivityItemOut(
            id=event.id,
            case_id=case_id,
            case_name=case_name,
            title=event.title,
            event_type=event.event_type.value,
            event_date=event.event_date,
            created_at=event.created_at,
        )
        for event, case_name, case_id in rows
    ]
