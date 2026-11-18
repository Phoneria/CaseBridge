"""audit_events: metadata-only log of user actions for CaseBridge process analytics

Revision ID: d4e6f8a0b2c4
Revises: c8f2a4e6b0d1
Create Date: 2026-11-17 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e6f8a0b2c4"
down_revision: Union[str, Sequence[str], None] = "c8f2a4e6b0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_role", sa.String(20), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("case_id", sa.String(36), nullable=True),
        sa.Column("case_type", sa.String(40), nullable=True),
        sa.Column("target_type", sa.String(40), nullable=True),
        sa.Column("target_id", sa.String(36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_events_law_firm_id_occurred_at", "audit_events", ["law_firm_id", "occurred_at"])
    op.create_index("ix_audit_events_case_id", "audit_events", ["case_id"])
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_case_id", table_name="audit_events")
    op.drop_index("ix_audit_events_law_firm_id_occurred_at", table_name="audit_events")
    op.drop_table("audit_events")
