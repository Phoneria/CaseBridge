"""Separate the imported public decisions from firm caseload analytics.

Only the twenty known imported decision numbers in the demo firm are
reclassified. Rows and attached documents remain intact and reversible.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4d8c3b2a190"
down_revision: Union[str, Sequence[str], None] = "e8b4a92d1f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_IMPORTED_DECISIONS = (
    "Y10HD 2025/19403 E. 2026/6171 K.",
    "Y9HD 2026/1024 E. 2026/2756 K.",
    "Y9HD 2026/2240 E. 2026/4872 K.",
    "Y9HD 2026/1149 E. 2026/6511 K.",
    "Y3HD 2025/4986 E. 2026/3318 K.",
    "Y3HD 2026/113 E. 2026/3228 K.",
    "Y3HD 2025/6254 E. 2026/3320 K.",
    "YHGK 2017/2792 E. 2021/267 K.",
    "Y11HD 2025/2041 E. 2025/7105 K.",
    "Y11HD 2026/779 E. 2026/2274 K.",
    "Y11HD 2025/6170 E. 2026/3050 K.",
    "Y11HD 2025/5901 E. 2026/3196 K.",
    "Y11HD 2025/5832 E. 2026/3197 K.",
    "Y6HD 2026/1829 E. 2026/2218 K.",
    "Y11HD 2026/2663 E. 2026/4173 K.",
    "Y19HD 2016/20295 E. 2018/5475 K.",
    "Y6HD 2025/2828 E. 2026/2021 K.",
    "Y3HD 2026/1586 E. 2026/3223 K.",
    "Y3HD 2025/5719 E. 2026/2961 K.",
    "Y6HD 2026/1302 E. 2026/2938 K.",
)


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("is_precedent", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_index("ix_cases_is_precedent", ["is_precedent"])

    connection = op.get_bind()
    cases = sa.table(
        "cases", sa.column("case_number", sa.String()), sa.column("client_name", sa.String()),
        sa.column("law_firm_id", sa.String()), sa.column("is_precedent", sa.Boolean()),
        sa.column("assigned_lawyer_id", sa.String()),
    )
    firms = sa.table("law_firms", sa.column("id", sa.String()), sa.column("name", sa.String()))
    demo_firm = connection.execute(sa.select(firms.c.id).where(firms.c.name == "Demo Hukuk Bürosu")).scalar_one_or_none()
    if demo_firm:
        connection.execute(
            sa.update(cases).where(
                cases.c.law_firm_id == demo_firm,
                cases.c.client_name == "Davacı (anonim)",
                cases.c.case_number.in_(_IMPORTED_DECISIONS),
            ).values(is_precedent=True, assigned_lawyer_id=None)
        )


def downgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.drop_index("ix_cases_is_precedent")
        batch.drop_column("is_precedent")
