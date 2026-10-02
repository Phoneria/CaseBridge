"""add reminder deliveries

Revision ID: f3b5d7e9a1c2
Revises: e2a4c6b8d0f1
Create Date: 2026-10-02 19:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3b5d7e9a1c2"
down_revision: Union[str, Sequence[str], None] = "e2a4c6b8d0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reminder_deliveries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column(
            "source_type",
            sa.Enum("event", "task", "case_hearing", name="remindersourcetype"),
            nullable=False,
        ),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column("recipient_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.Enum("sent", "failed", name="reminderdeliverystatus"), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(length=300), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "source_type",
            "source_id",
            "occurrence_date",
            "days_before",
            "recipient_user_id",
            name="uq_reminder_deliveries_occurrence",
        ),
    )
    op.create_index("ix_reminder_deliveries_law_firm_id", "reminder_deliveries", ["law_firm_id"])


def downgrade() -> None:
    op.drop_index("ix_reminder_deliveries_law_firm_id", table_name="reminder_deliveries")
    op.drop_table("reminder_deliveries")
    sa.Enum(name="reminderdeliverystatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="remindersourcetype").drop(op.get_bind(), checkfirst=True)
