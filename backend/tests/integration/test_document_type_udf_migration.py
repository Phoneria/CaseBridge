"""The UDF document type migration is a no-op outside PostgreSQL and downgrades cleanly."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "0244bf696c5e"
UDF_REVISION = "e2b4d6f8a1c3"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _version(url: str) -> str:
    with sa.create_engine(url).connect() as conn:
        return conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()


def test_udf_migration_upgrades_and_downgrades_on_sqlite(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    command.upgrade(config, "head")
    assert _version(url) == UDF_REVISION

    command.downgrade(config, PREVIOUS_HEAD)
    assert _version(url) == PREVIOUS_HEAD
