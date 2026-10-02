"""add answer level to chat messages

Revision ID: d7a3c9e1b5f2
Revises: c4d1a7e9f2b3
Create Date: 2026-10-02 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7a3c9e1b5f2"
down_revision: Union[str, Sequence[str], None] = "c4d1a7e9f2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.add_column(sa.Column("level", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.drop_column("level")
