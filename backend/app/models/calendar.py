import enum
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import str_enum


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CalendarEventType(str, enum.Enum):
    HEARING = "hearing"
    MEETING = "meeting"
    CLIENT_MEETING = "client_meeting"
    OTHER = "other"


class CalendarEvent(Base):
    """A user-created calendar entry. starts_at is a naive local time in
    APP_TIMEZONE; for all-day events it is midnight and only the date counts."""

    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[CalendarEventType] = mapped_column(str_enum(CalendarEventType), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    case_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True, index=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reminder_days: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)


class ReminderSourceType(str, enum.Enum):
    EVENT = "event"
    TASK = "task"
    CASE_HEARING = "case_hearing"


class ReminderDeliveryStatus(str, enum.Enum):
    SENT = "sent"
    FAILED = "failed"


class ReminderDelivery(Base):
    """One reminder e-mail (per source, occurrence day, offset and
    recipient). Moving an event to another day changes occurrence_date,
    so a new reminder is due for the new day."""

    __tablename__ = "reminder_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "source_type",
            "source_id",
            "occurrence_date",
            "days_before",
            "recipient_user_id",
            name="uq_reminder_deliveries_occurrence",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    source_type: Mapped[ReminderSourceType] = mapped_column(str_enum(ReminderSourceType), nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    occurrence_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_before: Mapped[int] = mapped_column(Integer, nullable=False)
    recipient_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[ReminderDeliveryStatus] = mapped_column(str_enum(ReminderDeliveryStatus), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    #: Short, content-free error code (e.g. "SMTPServerDisconnected").
    last_error: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)
