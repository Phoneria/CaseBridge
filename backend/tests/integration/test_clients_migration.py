"""The clients migration links every client party of a non-precedent case to
one client per firm and normalized name, and downgrades cleanly."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "b9d3e7f1a520"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_case(conn, case_id, firm, client_name, is_precedent=False):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, case_type, opening_date, "
            "status, outcome, is_archived, is_precedent, created_at, updated_at) "
            "VALUES (:id, :firm, :id, 'Dava', :client, 'kira', '2026-01-01', 'devam_eden', 'ongoing', 0, :precedent, "
            "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        ),
        {"id": case_id, "firm": firm, "client": client_name, "precedent": is_precedent},
    )


def _insert_party(conn, party_id, case_id, firm, name, is_client, sort_order, created_at):
    conn.execute(
        sa.text(
            "INSERT INTO case_parties (id, case_id, law_firm_id, name, role, is_client, sort_order, created_at) "
            "VALUES (:id, :case, :firm, :name, 'other', :client, :sort, :created)"
        ),
        {"id": party_id, "case": case_id, "firm": firm, "name": name, "client": is_client,
         "sort": sort_order, "created": created_at},
    )


def test_migration_links_client_parties_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        for firm in ("firm-1", "firm-2"):
            conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES (:id, :id, '2026-01-01 00:00:00')"), {"id": firm})
        # firm-1, "acme ltd." twice and "ACME  Ltd." once: the most frequent spelling wins.
        _insert_case(conn, "c1", "firm-1", "ACME  Ltd.")
        _insert_party(conn, "p1", "c1", "firm-1", "ACME  Ltd.", True, 0, "2026-01-01 00:00:00")
        _insert_party(conn, "p1b", "c1", "firm-1", "Karşı Taraf", False, 1, "2026-01-01 00:00:00")
        _insert_case(conn, "c2", "firm-1", "acme ltd.")
        _insert_party(conn, "p2", "c2", "firm-1", "acme ltd.", True, 0, "2026-01-02 00:00:00")
        _insert_case(conn, "c3", "firm-1", "acme ltd.")
        _insert_party(conn, "p3", "c3", "firm-1", "acme ltd.", True, 0, "2026-01-03 00:00:00")
        # A tie: the earliest party's spelling wins.
        _insert_case(conn, "c4", "firm-1", "Ahmet Yılmaz")
        _insert_party(conn, "p4", "c4", "firm-1", "Ahmet Yılmaz", True, 0, "2026-01-04 00:00:00")
        _insert_case(conn, "c5", "firm-1", "AHMET YILMAZ")
        _insert_party(conn, "p5", "c5", "firm-1", "AHMET YILMAZ", True, 0, "2026-01-05 00:00:00")
        # The same name in another firm is another client.
        _insert_case(conn, "c6", "firm-2", "Acme Ltd.")
        _insert_party(conn, "p6", "c6", "firm-2", "Acme Ltd.", True, 0, "2026-01-06 00:00:00")
        # Precedents are never linked.
        _insert_case(conn, "c7", "firm-1", "Davacı (anonim)", is_precedent=True)
        _insert_party(conn, "p7", "c7", "firm-1", "Davacı (anonim)", True, 0, "2026-01-07 00:00:00")

    command.upgrade(config, "head")

    with sa.create_engine(url).connect() as conn:
        clients = conn.execute(sa.text("SELECT law_firm_id, name, name_key, client_type FROM clients ORDER BY law_firm_id, name_key")).all()
        assert [tuple(row) for row in clients] == [
            ("firm-1", "acme ltd.", "acme ltd.", "person"),
            ("firm-1", "Ahmet Yılmaz", "ahmet yılmaz", "person"),
            ("firm-2", "Acme Ltd.", "acme ltd.", "person"),
        ]
        links = dict(conn.execute(sa.text(
            "SELECT p.id, c.name FROM case_parties p LEFT JOIN clients c ON c.id = p.client_id"
        )).all())
        assert links == {
            "p1": "acme ltd.", "p1b": None, "p2": "acme ltd.", "p3": "acme ltd.",
            "p4": "Ahmet Yılmaz", "p5": "Ahmet Yılmaz", "p6": "Acme Ltd.", "p7": None,
        }
        names = dict(conn.execute(sa.text("SELECT id, name FROM case_parties")).all())
        assert names["p1"] == "acme ltd." and names["p5"] == "Ahmet Yılmaz" and names["p1b"] == "Karşı Taraf"
        client_names = dict(conn.execute(sa.text("SELECT id, client_name FROM cases")).all())
        assert client_names["c1"] == "acme ltd."
        assert client_names["c5"] == "Ahmet Yılmaz"
        assert client_names["c7"] == "Davacı (anonim)"

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert "clients" not in inspector.get_table_names()
    assert "client_id" not in {column["name"] for column in inspector.get_columns("case_parties")}
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM case_parties")).scalar_one() == 8
