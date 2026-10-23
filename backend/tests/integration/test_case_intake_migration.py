"""The Alembic chain adds the case intake columns and the case_parties
table, and turns every existing case's client/opposing party into parties."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "a9c3e5f7b1d4"
NEW_CASE_COLUMNS = {
    "client_role",
    "court_file_number",
    "claim",
    "facts_summary",
    "plaintiff_position",
    "defendant_position",
}


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_case(conn, case_id, number, client, opposing, is_precedent=False):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, opposing_party, "
            "case_type, opening_date, status, outcome, is_archived, is_precedent, created_at, updated_at) "
            "VALUES (:id, 'firm-1', :number, 'Dava', :client, :opposing, 'kira', '2026-01-01', 'devam_eden', 'ongoing', "
            "0, :precedent, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        ),
        {"id": case_id, "number": number, "client": client, "opposing": opposing, "precedent": is_precedent},
    )


def test_migration_converts_existing_cases_into_parties_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES ('firm-1', 'Büro', '2026-01-01 00:00:00')"))
        _insert_case(conn, "c-both", "2026/1", "Ahmet Yılmaz", "Zeynep Kaya")
        _insert_case(conn, "c-client-only", "2026/2", "Mehmet Demir", None)
        _insert_case(conn, "c-blank-opposing", "2026/3", "Ayşe Tunç", "   ")
        _insert_case(conn, "c-precedent", "Y9HD 2026/1", "Davacı (anonim)", "Davalı Şirket", is_precedent=True)

    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    assert NEW_CASE_COLUMNS <= {column["name"] for column in inspector.get_columns("cases")}
    assert {column["name"] for column in inspector.get_columns("case_parties")} >= {
        "id", "case_id", "law_firm_id", "name", "role", "is_client", "counsel_name", "sort_order", "created_at",
    }
    assert {index["name"] for index in inspector.get_indexes("case_parties")} >= {
        "ix_case_parties_case_id", "ix_case_parties_law_firm_id",
    }

    with sa.create_engine(url).connect() as conn:
        rows = conn.execute(
            sa.text("SELECT case_id, name, role, is_client, counsel_name, sort_order, law_firm_id "
                    "FROM case_parties ORDER BY case_id, sort_order")
        ).all()
        assert [tuple(row) for row in rows] == [
            ("c-blank-opposing", "Ayşe Tunç", "other", 1, None, 0, "firm-1"),
            ("c-both", "Ahmet Yılmaz", "other", 1, None, 0, "firm-1"),
            ("c-both", "Zeynep Kaya", "other", 0, None, 1, "firm-1"),
            ("c-client-only", "Mehmet Demir", "other", 1, None, 0, "firm-1"),
            ("c-precedent", "Davacı (anonim)", "other", 1, None, 0, "firm-1"),
            ("c-precedent", "Davalı Şirket", "other", 0, None, 1, "firm-1"),
        ]
        assert conn.execute(sa.text("SELECT COUNT(*) FROM cases WHERE client_role IS NOT NULL")).scalar_one() == 0
        assert conn.execute(sa.text("SELECT client_name FROM cases WHERE id = 'c-both'")).scalar_one() == "Ahmet Yılmaz"

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert "case_parties" not in inspector.get_table_names()
    assert not (NEW_CASE_COLUMNS & {column["name"] for column in inspector.get_columns("cases")})
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM cases")).scalar_one() == 4
