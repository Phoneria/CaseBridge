"""add case intake fields and case parties

Revision ID: c8f2a6d4e1b7
Revises: a9c3e5f7b1d4
Create Date: 2026-10-09 00:00:00

Existing cases keep client_name / opposing_party and additionally get
parties: the client becomes a party (is_client, role "other", order 0) and a
non-blank opposing party a second one (role "other", order 1). client_role
stays empty because the old data never recorded which side the client is on.
"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8f2a6d4e1b7"
down_revision: Union[str, Sequence[str], None] = "a9c3e5f7b1d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("client_role", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("court_file_number", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("claim", sa.Text(), nullable=True))
        batch.add_column(sa.Column("facts_summary", sa.Text(), nullable=True))
        batch.add_column(sa.Column("plaintiff_position", sa.Text(), nullable=True))
        batch.add_column(sa.Column("defendant_position", sa.Text(), nullable=True))

    parties = op.create_table(
        "case_parties",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("is_client", sa.Boolean(), nullable=False),
        sa.Column("counsel_name", sa.String(length=255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_case_parties_case_id", "case_parties", ["case_id"])
    op.create_index("ix_case_parties_law_firm_id", "case_parties", ["law_firm_id"])

    cases = sa.table(
        "cases",
        sa.column("id", sa.String()),
        sa.column("law_firm_id", sa.String()),
        sa.column("client_name", sa.String()),
        sa.column("opposing_party", sa.String()),
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = []
    for case in op.get_bind().execute(
        sa.select(cases.c.id, cases.c.law_firm_id, cases.c.client_name, cases.c.opposing_party)
    ):
        names = [(case.client_name, True)]
        if case.opposing_party and case.opposing_party.strip():
            names.append((case.opposing_party, False))
        for order, (name, is_client) in enumerate(names):
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "case_id": case.id,
                    "law_firm_id": case.law_firm_id,
                    "name": name,
                    "role": "other",
                    "is_client": is_client,
                    "counsel_name": None,
                    "sort_order": order,
                    "created_at": now,
                }
            )
    if rows:
        op.bulk_insert(parties, rows)


def downgrade() -> None:
    op.drop_index("ix_case_parties_law_firm_id", table_name="case_parties")
    op.drop_index("ix_case_parties_case_id", table_name="case_parties")
    op.drop_table("case_parties")
    with op.batch_alter_table("cases") as batch:
        batch.drop_column("defendant_position")
        batch.drop_column("plaintiff_position")
        batch.drop_column("facts_summary")
        batch.drop_column("claim")
        batch.drop_column("court_file_number")
        batch.drop_column("client_role")
