"""Shared helper for the audit API tests."""
from typing import Optional

from app.models.audit import AuditEvent


def audit_rows(db_session, action: Optional[str] = None) -> list[AuditEvent]:
    db_session.expire_all()
    query = db_session.query(AuditEvent)
    if action is not None:
        query = query.filter(AuditEvent.action == action)
    return query.order_by(AuditEvent.occurred_at, AuditEvent.id).all()
