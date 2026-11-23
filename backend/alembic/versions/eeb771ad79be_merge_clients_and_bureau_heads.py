"""merge clients and bureau management heads

Revision ID: eeb771ad79be
Revises: c8f2a4e6b0d1, d8e9f0a1b2c3
Create Date: 2026-11-22 12:00:00
"""
from typing import Sequence, Union

revision: str = "eeb771ad79be"
down_revision: Union[str, Sequence[str], None] = ("c8f2a4e6b0d1", "d8e9f0a1b2c3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
