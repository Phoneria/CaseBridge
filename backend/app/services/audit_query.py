"""One customer firm's audit events for the platform panel, newest first.

Same rows and date rules as the CSV export (app.services.audit_export); the
filters only narrow them. Metadata only, like everything in audit_events."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent


@dataclass(frozen=True)
class AuditFilters:
    start: date
    end: date
    action: Optional[str] = None
    actor_user_id: Optional[str] = None
    case_id: Optional[str] = None


def _filtered(db: Session, firm_id: str, filters: AuditFilters):
    query = db.query(AuditEvent).filter(
        AuditEvent.law_firm_id == firm_id,
        AuditEvent.occurred_at >= datetime.combine(filters.start, time.min),
        AuditEvent.occurred_at < datetime.combine(filters.end + timedelta(days=1), time.min),
    )
    if filters.action is not None:
        query = query.filter(AuditEvent.action == filters.action)
    if filters.actor_user_id is not None:
        query = query.filter(AuditEvent.actor_user_id == filters.actor_user_id)
    if filters.case_id is not None:
        query = query.filter(AuditEvent.case_id == filters.case_id)
    return query


def list_firm_audit_events(db: Session, firm_id: str, filters: AuditFilters, limit: int, offset: int):
    """(total, count per action, one page of rows) for the filtered range."""
    query = _filtered(db, firm_id, filters)
    by_action = dict(
        query.with_entities(AuditEvent.action, func.count(AuditEvent.id)).group_by(AuditEvent.action).all()
    )
    rows = (
        query.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).offset(offset).limit(limit).all()
    )
    return sum(by_action.values()), dict(sorted(by_action.items())), rows
