"""add explicit party names to courtroom scenarios

Revision ID: b83a4e0c1d29
Revises: 6f2d1c4a9b77
Create Date: 2026-09-03 15:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b83a4e0c1d29"
down_revision: Union[str, Sequence[str], None] = "6f2d1c4a9b77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courtroom_scenarios",
        sa.Column("plaintiff_name", sa.String(length=255), server_default="Davacı", nullable=False),
    )
    op.add_column(
        "courtroom_scenarios",
        sa.Column("defendant_name", sa.String(length=255), server_default="Davalı", nullable=False),
    )


def downgrade() -> None:
    with op.batch_alter_table("courtroom_scenarios", schema=None) as batch_op:
        batch_op.drop_column("defendant_name")
        batch_op.drop_column("plaintiff_name")
