"""Platform firms: firm status (suspension), the internal platform firm and the
platform admin flag.

Revision ID: c4e6a8b0d2f3
Revises: a7d2e4f6b8c1
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b0d2f3"
down_revision: Union[str, Sequence[str], None] = "a7d2e4f6b8c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("law_firms") as batch:
        batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("suspended_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("is_platform", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_platform_admin")
    with op.batch_alter_table("law_firms") as batch:
        batch.drop_column("is_platform")
        batch.drop_column("suspended_at")
        batch.drop_column("is_active")
