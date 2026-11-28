import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuditEvent(Base):
    """One user action, kept for CaseBridge's process analytics. Metadata only:
    app.services.audit.record_audit is the only writer and takes no free text."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_events_law_firm_id_occurred_at", "law_firm_id", "occurred_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    # Not a foreign key: the history stays when a case is deleted.
    case_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    case_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    target_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    target_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Naive UTC, like the CSV range boundaries.
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
