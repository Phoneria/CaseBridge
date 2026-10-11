"""The Alembic chain adds cases.decision_date / closing_note; existing cases
(closed ones included) keep both empty."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "d5b2f8a1c3e6"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_case(conn, case_id, number, status, outcome):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, "
            "case_type, opening_date, status, outcome, is_archived, is_precedent, created_at, updated_at) "
            "VALUES (:id, 'firm-1', :number, 'Dava', 'Müvekkil', 'kira', '2026-01-01', :status, :outcome, "
            "0, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        ),
        {"id": case_id, "number": number, "status": status, "outcome": outcome},
    )


def test_migration_adds_empty_decision_columns_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES ('firm-1', 'Büro', '2026-01-01 00:00:00')"))
        _insert_case(conn, "c-open", "2026/1", "devam_eden", "ongoing")
        _insert_case(conn, "c-closed", "2026/2", "kapali", "won")

    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    columns = {column["name"]: column for column in inspector.get_columns("cases")}
    assert {"decision_date", "closing_note"} <= set(columns)
    assert all(columns[name]["nullable"] for name in ("decision_date", "closing_note"))

    with sa.create_engine(url).connect() as conn:
        rows = conn.execute(sa.text("SELECT id, decision_date, closing_note, outcome FROM cases ORDER BY id")).all()
        assert [(row[0], row[1], row[2], row[3]) for row in rows] == [
            ("c-closed", None, None, "won"),
            ("c-open", None, None, "ongoing"),
        ]

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert not ({"decision_date", "closing_note"} & {column["name"] for column in inspector.get_columns("cases")})
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM cases")).scalar_one() == 2
