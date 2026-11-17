from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "c8f2a4e6b0d1"


def test_audit_events_table_upgrades_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'audit.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.upgrade(config, PREVIOUS_HEAD)
    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    columns = {c["name"] for c in inspector.get_columns("audit_events")}
    assert columns == {"id", "law_firm_id", "actor_user_id", "actor_role", "action", "case_id", "case_type",
                       "target_type", "target_id", "details", "occurred_at"}
    indexes = {i["name"] for i in inspector.get_indexes("audit_events")}
    assert {"ix_audit_events_law_firm_id_occurred_at", "ix_audit_events_case_id",
            "ix_audit_events_actor_user_id"} <= indexes

    command.downgrade(config, PREVIOUS_HEAD)
    assert "audit_events" not in sa.inspect(sa.create_engine(url)).get_table_names()
