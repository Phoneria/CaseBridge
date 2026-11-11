"""Disposable database only: schema round trip and durable bureau scoping."""
from io import StringIO

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.db.migrate import ALEMBIC_DIR, upgrade_to_head
from app.models.law_firm import LawFirm
from app.models.management import FirmProfile, ManagementRecord, WorkTransfer, WorkspaceAccess
from app.models.user import User, UserRole


def test_sqlite_management_schema_round_trip_and_restart(tmp_path):
    url = f"sqlite:///{tmp_path / 'management.db'}"
    engine = create_engine(url)
    upgrade_to_head(engine)
    with Session(engine) as db:
        firm = LawFirm(name="Sentetik Büro")
        db.add(firm);db.flush()
        user = User(law_firm_id=firm.id, full_name="Sentetik Yönetici", email="migration@example.com", hashed_password="synthetic-hash", role=UserRole.ADMIN)
        db.add(user);db.flush()
        row = ManagementRecord(law_firm_id=firm.id, kind="support", title="Kalıcı kayıt", status="open", data={"priority": "normal", "note": "Sentetik"}, created_by=user.id)
        db.add(row);db.commit()
        firm_id, record_id = firm.id, row.id
    engine.dispose()
    engine = create_engine(url)
    with Session(engine) as db:
        stored = db.get(ManagementRecord, record_id)
        assert stored.law_firm_id == firm_id
        assert stored.title == "Kalıcı kayıt" and stored.version == 1
    cfg = Config();cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "b9d3e7f1a520")
    assert "management_records" not in inspect(engine).get_table_names()
    upgrade_to_head(engine)
    assert {"management_records", "management_audits", "workspace_access", "firm_profiles", "work_transfers"}.issubset(inspect(engine).get_table_names())
    assert "last_seen_at" in {c["name"] for c in inspect(engine).get_columns("users")}
    engine.dispose()


def test_postgres_management_migration_generates_sql_without_connecting(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "database_url", "postgresql://synthetic:synthetic@invalid.example/unused")
    output = StringIO()
    cfg = Config(output_buffer=output)
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    command.upgrade(cfg, "b9d3e7f1a520:head", sql=True)
    sql = output.getvalue()
    assert "CREATE TABLE management_records" in sql
    assert "CREATE TABLE work_transfers" in sql
    assert "ADD COLUMN last_seen_at" in sql
