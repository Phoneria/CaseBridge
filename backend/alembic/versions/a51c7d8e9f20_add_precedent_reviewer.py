"""Add a separate reviewer for precedent research assignments.

Existing public decisions are distributed across the three demo lawyers;
their assignments never imply ownership of a client case or a court outcome.
"""
from collections import defaultdict
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a51c7d8e9f20"
down_revision: Union[str, Sequence[str], None] = "f4d8c3b2a190"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMAILS = (
    "avukat@demo.casebridge.dev",
    "kerem@demo.casebridge.dev",
    "zeynep@demo.casebridge.dev",
)
_ORDER = ("ticaret_hukuku", "is_hukuku", "kira", "sozlesme", "icra", "diger")
_PREFERENCES = {
    "ticaret_hukuku": (0, 1, 2),
    "is_hukuku": (1, 0, 2),
    "kira": (2, 0, 1),
    "sozlesme": (0, 2, 1),
    "icra": (1, 2, 0),
    "diger": (2, 0, 1),
}


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("reviewer_lawyer_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key("fk_cases_reviewer_lawyer_id_users", "users", ["reviewer_lawyer_id"], ["id"])

    connection = op.get_bind()
    firms = sa.table("law_firms", sa.column("id", sa.String()), sa.column("name", sa.String()))
    demo_firm = connection.execute(sa.select(firms.c.id).where(firms.c.name == "Demo Hukuk Bürosu")).scalar_one_or_none()
    if demo_firm is None:
        return
    users = sa.table("users", sa.column("id", sa.String()), sa.column("email", sa.String()), sa.column("law_firm_id", sa.String()))
    cases = sa.table(
        "cases", sa.column("id", sa.String()), sa.column("case_number", sa.String()),
        sa.column("case_type", sa.String()), sa.column("is_precedent", sa.Boolean()),
        sa.column("reviewer_lawyer_id", sa.String()), sa.column("law_firm_id", sa.String()),
    )
    lawyer_ids = [connection.execute(sa.select(users.c.id).where(
        users.c.email == email, users.c.law_firm_id == demo_firm,
    )).scalar_one_or_none() for email in _EMAILS]
    if any(lawyer_id is None for lawyer_id in lawyer_ids):
        return

    rows = connection.execute(sa.select(cases.c.id, cases.c.case_type, cases.c.case_number).where(
        cases.c.law_firm_id == demo_firm,
        cases.c.is_precedent.is_(True), cases.c.reviewer_lawyer_id.is_(None),
    )).all()
    # Existing installations have exactly 20 known decisions (four in each of
    # five categories): the capacities become 7/7/6. Other installations get
    # the same deterministic balanced allocation for their own row count.
    total = len(rows)
    capacities = [total // 3 + (1 if index < total % 3 else 0) for index in range(3)]
    counts = [0, 0, 0]
    grouped = defaultdict(list)
    for row in rows:
        grouped[row.case_type].append(row)
    for category in _ORDER:
        for row in sorted(grouped.pop(category, []), key=lambda item: item.case_number):
            order = _PREFERENCES[category]
            chosen = next((index for index in order if counts[index] < capacities[index]), min(range(3), key=lambda index: counts[index]))
            connection.execute(sa.update(cases).where(cases.c.id == row.id).values(reviewer_lawyer_id=lawyer_ids[chosen]))
            counts[chosen] += 1
    for category in sorted(grouped):
        for row in sorted(grouped[category], key=lambda item: item.case_number):
            chosen = min(range(3), key=lambda index: counts[index])
            connection.execute(sa.update(cases).where(cases.c.id == row.id).values(reviewer_lawyer_id=lawyer_ids[chosen]))
            counts[chosen] += 1


def downgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.drop_constraint("fk_cases_reviewer_lawyer_id_users", type_="foreignkey")
        batch.drop_column("reviewer_lawyer_id")
