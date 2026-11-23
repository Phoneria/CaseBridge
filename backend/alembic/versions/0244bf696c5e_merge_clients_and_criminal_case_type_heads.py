"""merge clients and criminal case type heads

Revision ID: 0244bf696c5e
Revises: eeb771ad79be, fa28b1d90311
Create Date: 2026-11-23 23:30:00
"""
from typing import Sequence, Union

revision: str = "0244bf696c5e"
down_revision: Union[str, Sequence[str], None] = ("eeb771ad79be", "fa28b1d90311")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
