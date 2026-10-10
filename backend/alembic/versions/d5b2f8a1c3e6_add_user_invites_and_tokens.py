"""add user invite state and one-time user tokens

Revision ID: d5b2f8a1c3e6
Revises: c8f2a6d4e1b7
Create Date: 2026-10-11 00:00:00

users.password_set_at is NULL while a user has been invited but has not chosen
a password yet. Every existing user already has a working password, so the
column is filled with created_at (the migration time if it were ever empty).
user_tokens holds the one-time invite / password reset tokens (digest only).
"""
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5b2f8a1c3e6"
down_revision: Union[str, Sequence[str], None] = "c8f2a6d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("password_set_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("invited_at", sa.DateTime(), nullable=True))

    users = sa.table(
        "users",
        sa.column("created_at", sa.DateTime()),
        sa.column("password_set_at", sa.DateTime()),
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    op.execute(users.update().values(password_set_at=sa.func.coalesce(users.c.created_at, now)))

    op.create_table(
        "user_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_tokens_user_id", "user_tokens", ["user_id"])
    op.create_index("ix_user_tokens_law_firm_id", "user_tokens", ["law_firm_id"])
    op.create_index("ix_user_tokens_token_hash", "user_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_tokens_token_hash", table_name="user_tokens")
    op.drop_index("ix_user_tokens_law_firm_id", table_name="user_tokens")
    op.drop_index("ix_user_tokens_user_id", table_name="user_tokens")
    op.drop_table("user_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("invited_at")
        batch.drop_column("password_set_at")
