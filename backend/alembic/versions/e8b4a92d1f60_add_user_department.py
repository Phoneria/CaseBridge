"""Add lawyer department.

Revision ID: e8b4a92d1f60
Revises: d7a3c9e1b5f2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8b4a92d1f60"
down_revision: Union[str, Sequence[str], None] = "d7a3c9e1b5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("department", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("gender", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("gender")
        batch.drop_column("department")
