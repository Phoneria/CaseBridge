"""chat message sources (CaseBridge AI data tools)

NULL: the answer ran without data tools. A JSON list (possibly empty): the
answer ran with the read-only data tools; the list holds the links it used.

Revision ID: a7c3e9d1f2b4
Revises: 0244bf696c5e
Create Date: 2026-11-24 15:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e9d1f2b4"
down_revision: Union[str, Sequence[str], None] = "0244bf696c5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("sources", sa.JSON(none_as_null=True), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "sources")
