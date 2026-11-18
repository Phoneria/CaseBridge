"""clients table; every client party of a non-precedent case is linked to a client

Revision ID: c8f2a4e6b0d1
Revises: b9d3e7f1a520
Create Date: 2026-11-16 12:00:00

Client parties of the same firm whose names normalize to the same key share
one client. Its name is the most frequent spelling in the group (a tie goes to
the earliest party's). Linked parties take that name, and cases whose client
party names changed get client_name re-derived (names joined with ", " in
sort order, cut to 255 characters, as app.services.case_parties does).
"""
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8f2a4e6b0d1"
down_revision: Union[str, Sequence[str], None] = "b9d3e7f1a520"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK_NAME = "fk_case_parties_client_id_clients"
MAX_JOINED_LENGTH = 255


def _name_key(name: str) -> str:
    # Copy of app.services.client_names.client_name_key: a migration must not change with app code.
    collapsed = " ".join(name.split())
    return collapsed.replace("I", "ı").replace("İ", "i").lower()


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("name_key", sa.String(255), nullable=False),
        sa.Column("client_type", sa.String(20), nullable=False, server_default="person"),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_clients_law_firm_id", "clients", ["law_firm_id"])
    op.create_index("ix_clients_law_firm_id_name_key", "clients", ["law_firm_id", "name_key"])
    with op.batch_alter_table("case_parties") as batch:
        batch.add_column(sa.Column("client_id", sa.String(36), nullable=True))
        batch.create_foreign_key(FK_NAME, "clients", ["client_id"], ["id"])
        batch.create_index("ix_case_parties_client_id", ["client_id"])
    _link_existing_parties(op.get_bind())


def _link_existing_parties(conn) -> None:
    rows = conn.execute(
        sa.text(
            "SELECT p.id, p.case_id, p.law_firm_id, p.name, p.created_at FROM case_parties p "
            "JOIN cases c ON c.id = p.case_id "
            "WHERE p.is_client = :yes AND c.is_precedent = :no ORDER BY p.created_at, p.id"
        ),
        {"yes": True, "no": False},
    ).all()
    groups: dict[tuple[str, str], list] = {}
    for row in rows:
        groups.setdefault((row.law_firm_id, _name_key(row.name)), []).append(row)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    renamed_cases: set[str] = set()
    for (law_firm_id, key), members in groups.items():
        counts = Counter(member.name for member in members)
        top = max(counts.values())
        name = next(member.name for member in members if counts[member.name] == top)
        client_id = str(uuid.uuid4())
        created_at = members[0].created_at or now
        conn.execute(
            sa.text(
                "INSERT INTO clients (id, law_firm_id, name, name_key, client_type, created_at, updated_at) "
                "VALUES (:id, :firm, :name, :key, 'person', :created, :created)"
            ),
            {"id": client_id, "firm": law_firm_id, "name": name, "key": key, "created": created_at},
        )
        for member in members:
            conn.execute(
                sa.text("UPDATE case_parties SET client_id = :client, name = :name WHERE id = :id"),
                {"client": client_id, "name": name, "id": member.id},
            )
            if member.name != name:
                renamed_cases.add(member.case_id)

    for case_id in sorted(renamed_cases):
        names = conn.execute(
            sa.text("SELECT name FROM case_parties WHERE case_id = :case AND is_client = :yes ORDER BY sort_order, id"),
            {"case": case_id, "yes": True},
        ).scalars().all()
        conn.execute(
            sa.text("UPDATE cases SET client_name = :name WHERE id = :case"),
            {"name": ", ".join(names)[:MAX_JOINED_LENGTH], "case": case_id},
        )


def downgrade() -> None:
    # Dropping the column also drops its foreign key: PostgreSQL drops it
    # with the column, and SQLite's batch copy leaves out constraints on
    # columns that no longer exist. Party names stay, so nothing is lost.
    with op.batch_alter_table("case_parties") as batch:
        batch.drop_index("ix_case_parties_client_id")
        batch.drop_column("client_id")
    op.drop_index("ix_clients_law_firm_id_name_key", table_name="clients")
    op.drop_index("ix_clients_law_firm_id", table_name="clients")
    op.drop_table("clients")
