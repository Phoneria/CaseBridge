"""Run the Alembic migrations from code.

The schema is owned by Alembic: creating tables with
Base.metadata.create_all() leaves them unrecorded in alembic_version, and
the next `alembic upgrade head` then fails trying to create them again.
"""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"


def upgrade_to_head(engine: Engine) -> None:
    # No ini file: env.py then skips fileConfig and leaves app logging alone.
    config = Config()
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
