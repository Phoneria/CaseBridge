"""hearing results; every case hearing date becomes a calendar event

Revision ID: a7d2e4f6b8c1
Revises: e6c1b9a4d2f8
Create Date: 2026-10-12 12:00:00

calendar_events gets result_note and result_case_event_id. A hearing now lives
in one place, a calendar event of type "hearing" linked to the case, and
cases.next_hearing_date is only a cache of the earliest one that is today or
later. So every case that has a next_hearing_date but no hearing event on that
day gets an all-day "Duruşma" event, the reminders already sent for the old
date are copied to the new event (no second e-mail), and every case's cache is
recomputed with the local date of the migration.
"""
import logging
import uuid
from datetime import date, datetime, time, timedelta
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.timeutil import local_today, utc_now
from app.domain.calendar import HEARING_REMINDER_DAYS

revision: str = "a7d2e4f6b8c1"
down_revision: Union[str, Sequence[str], None] = "e6c1b9a4d2f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

_STR = sa.String(length=36)
_cases = sa.table(
    "cases",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("assigned_lawyer_id", _STR),
    sa.column("next_hearing_date", sa.Date()),
    sa.column("is_precedent", sa.Boolean()),
)
_users = sa.table(
    "users",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("role", sa.Enum("admin", "lawyer", name="userrole", create_type=False)),
    sa.column("is_active", sa.Boolean()),
    sa.column("created_at", sa.DateTime()),
)
_events = sa.table(
    "calendar_events",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("title", sa.String()),
    sa.column(
        "event_type",
        sa.Enum("hearing", "meeting", "client_meeting", "other", name="calendareventtype", create_type=False),
    ),
    sa.column("starts_at", sa.DateTime()),
    sa.column("all_day", sa.Boolean()),
    sa.column("duration_minutes", sa.Integer()),
    sa.column("case_id", _STR),
    sa.column("assignee_id", _STR),
    sa.column("created_by", _STR),
    sa.column("reminder_days", sa.JSON()),
    sa.column("created_at", sa.DateTime()),
    sa.column("updated_at", sa.DateTime()),
)
_SOURCE_TYPE = sa.Enum("event", "task", "case_hearing", name="remindersourcetype", create_type=False)
_deliveries = sa.table(
    "reminder_deliveries",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("source_type", _SOURCE_TYPE),
    sa.column("source_id", _STR),
    sa.column("occurrence_date", sa.Date()),
    sa.column("days_before", sa.Integer()),
    sa.column("recipient_user_id", _STR),
    sa.column("status", sa.Enum("sent", "failed", name="reminderdeliverystatus", create_type=False)),
    sa.column("attempts", sa.Integer()),
    sa.column("last_error", sa.String()),
    sa.column("sent_at", sa.DateTime()),
    sa.column("created_at", sa.DateTime()),
    sa.column("updated_at", sa.DateTime()),
)


def _creator_id(conn, law_firm_id: str, lawyer_id):
    """The responsible lawyer; else the firm's oldest active administrator; else its oldest user."""
    if lawyer_id:
        return lawyer_id
    oldest_admin = conn.execute(
        sa.select(_users.c.id)
        .where(_users.c.law_firm_id == law_firm_id, _users.c.role == "admin", _users.c.is_active.is_(True))
        .order_by(_users.c.created_at, _users.c.id)
        .limit(1)
    ).scalar()
    if oldest_admin:
        return oldest_admin
    return conn.execute(
        sa.select(_users.c.id).where(_users.c.law_firm_id == law_firm_id).order_by(_users.c.created_at, _users.c.id).limit(1)
    ).scalar()


def _has_hearing_on(conn, case_id: str, day: date) -> bool:
    return (
        conn.execute(
            sa.select(_events.c.id)
            .where(
                _events.c.case_id == case_id,
                _events.c.event_type == "hearing",
                _events.c.starts_at >= datetime.combine(day, time.min),
                _events.c.starts_at < datetime.combine(day + timedelta(days=1), time.min),
            )
            .limit(1)
        ).first()
        is not None
    )


def _copy_sent_reminders(conn, case_id: str, event_id: str, day: date) -> None:
    """The old per-case reminders already went out; the new event must not send them again."""
    old = conn.execute(sa.select(_deliveries).where(
        _deliveries.c.source_type == "case_hearing",
        _deliveries.c.source_id == case_id,
        _deliveries.c.occurrence_date == day,
    )).mappings().all()
    for row in old:
        conn.execute(sa.insert(_deliveries).values(
            {**dict(row), "id": str(uuid.uuid4()), "source_type": "event", "source_id": event_id}
        ))


def convert_case_hearings(conn, today: date) -> dict[str, int]:
    """Create the missing hearing events, then recompute every cache. Returns counts."""
    created = skipped = 0
    now = utc_now()
    pending = conn.execute(
        sa.select(_cases.c.id, _cases.c.law_firm_id, _cases.c.assigned_lawyer_id, _cases.c.next_hearing_date)
        .where(_cases.c.next_hearing_date.isnot(None), _cases.c.is_precedent.is_(False))
        .order_by(_cases.c.id)
    ).all()
    for case_id, firm_id, lawyer_id, day in pending:
        if _has_hearing_on(conn, case_id, day):
            continue
        creator = _creator_id(conn, firm_id, lawyer_id)
        if creator is None:
            skipped += 1
            logger.warning("Duruşma etkinliği oluşturulamadı (büroda kullanıcı yok): dava %s", case_id)
            continue
        event_id = str(uuid.uuid4())
        conn.execute(sa.insert(_events).values(
            id=event_id, law_firm_id=firm_id, title="Duruşma", event_type="hearing",
            starts_at=datetime.combine(day, time.min), all_day=True, duration_minutes=60,
            case_id=case_id, assignee_id=lawyer_id, created_by=creator,
            reminder_days=list(HEARING_REMINDER_DAYS), created_at=now, updated_at=now,
        ))
        _copy_sent_reminders(conn, case_id, event_id, day)
        created += 1

    earliest = dict(conn.execute(
        sa.select(_events.c.case_id, sa.func.min(_events.c.starts_at))
        .where(
            _events.c.event_type == "hearing",
            _events.c.case_id.isnot(None),
            _events.c.starts_at >= datetime.combine(today, time.min),
        )
        .group_by(_events.c.case_id)
    ).all())
    recomputed = 0
    for case_id, current in conn.execute(
        sa.select(_cases.c.id, _cases.c.next_hearing_date).where(_cases.c.is_precedent.is_(False))
    ).all():
        wanted = earliest[case_id].date() if case_id in earliest else None
        if wanted != current:
            conn.execute(sa.update(_cases).where(_cases.c.id == case_id).values(next_hearing_date=wanted))
            recomputed += 1
    logger.info("Duruşma tarihleri: %d etkinlik oluşturuldu, %d dava atlandı, %d tarih yeniden hesaplandı.",
                created, skipped, recomputed)
    return {"created": created, "skipped": skipped, "recomputed": recomputed}


def upgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch:
        batch.add_column(sa.Column("result_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column(
            "result_case_event_id",
            sa.String(length=36),
            sa.ForeignKey("case_events.id", name="fk_calendar_events_result_case_event_id", ondelete="SET NULL"),
            nullable=True,
        ))
    convert_case_hearings(op.get_bind(), local_today())


def downgrade() -> None:
    # The events created by upgrade() stay: they are ordinary hearings.
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("result_case_event_id")
        batch.drop_column("result_note")
