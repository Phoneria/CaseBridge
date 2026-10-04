"""add calendar events and task reminder days

Revision ID: e2a4c6b8d0f1
Revises: d7a3c9e1b5f2
Create Date: 2026-10-02 18:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2a4c6b8d0f1"
down_revision: Union[str, Sequence[str], None] = "d7a3c9e1b5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum("hearing", "meeting", "client_meeting", "other", name="calendareventtype"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("assignee_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reminder_days", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_calendar_events_law_firm_id", "calendar_events", ["law_firm_id"])
    op.create_index("ix_calendar_events_starts_at", "calendar_events", ["starts_at"])
    op.create_index("ix_calendar_events_case_id", "calendar_events", ["case_id"])

    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("reminder_days", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("reminder_days")
    op.drop_index("ix_calendar_events_case_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_starts_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_law_firm_id", table_name="calendar_events")
    op.drop_table("calendar_events")
    sa.Enum(name="calendareventtype").drop(op.get_bind(), checkfirst=True)
