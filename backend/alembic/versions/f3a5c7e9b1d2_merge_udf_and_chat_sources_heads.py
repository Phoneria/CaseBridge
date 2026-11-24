"""merge UDF document type and chat message sources heads

Revision ID: f3a5c7e9b1d2
Revises: a7c3e9d1f2b4, e2b4d6f8a1c3
Create Date: 2026-11-24 17:40:00
"""
from typing import Sequence, Union

revision: str = "f3a5c7e9b1d2"
down_revision: Union[str, Sequence[str], None] = ("a7c3e9d1f2b4", "e2b4d6f8a1c3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
