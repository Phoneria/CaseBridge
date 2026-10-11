"""add case decision date and closing note

Revision ID: e6c1b9a4d2f8
Revises: d5b2f8a1c3e6
Create Date: 2026-10-11 12:00:00

cases.decision_date and cases.closing_note are filled when a case is closed
with POST /cases/{id}/close. Cases that were closed before this release keep
both empty (the UI shows a dash).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6c1b9a4d2f8"
down_revision: Union[str, Sequence[str], None] = "d5b2f8a1c3e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("decision_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("closing_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.drop_column("closing_note")
        batch.drop_column("decision_date")
