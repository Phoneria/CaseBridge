"""The Alembic chain creates the calendar tables (and drops them again)."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    # No ini file: env.py then skips fileConfig, so test logging stays intact.
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def test_migration_adds_calendar_events_and_task_reminder_days(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, "e2a4c6b8d0f1")
    inspector = sa.inspect(sa.create_engine(url))
    assert "calendar_events" in inspector.get_table_names()
    assert "reminder_days" in {column["name"] for column in inspector.get_columns("tasks")}

    command.downgrade(config, "d7a3c9e1b5f2")
    inspector = sa.inspect(sa.create_engine(url))
    assert "calendar_events" not in inspector.get_table_names()
    assert "reminder_days" not in {column["name"] for column in inspector.get_columns("tasks")}


def test_migration_adds_reminder_deliveries(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, "f3b5d7e9a1c2")
    inspector = sa.inspect(sa.create_engine(url))
    assert "reminder_deliveries" in inspector.get_table_names()
    assert {c["name"] for c in inspector.get_unique_constraints("reminder_deliveries")} == {
        "uq_reminder_deliveries_occurrence"
    }

    command.downgrade(config, "e2a4c6b8d0f1")
    assert "reminder_deliveries" not in sa.inspect(sa.create_engine(url)).get_table_names()
