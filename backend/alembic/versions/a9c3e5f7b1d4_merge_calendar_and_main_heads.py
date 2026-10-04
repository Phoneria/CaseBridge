"""merge calendar reminders and main heads

Revision ID: a9c3e5f7b1d4
Revises: f3b5d7e9a1c2, c6e7a1f290bd
Create Date: 2026-10-04 12:00:00
"""
from typing import Sequence, Union

revision: str = "a9c3e5f7b1d4"
down_revision: Union[str, Sequence[str], None] = ("f3b5d7e9a1c2", "c6e7a1f290bd")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
