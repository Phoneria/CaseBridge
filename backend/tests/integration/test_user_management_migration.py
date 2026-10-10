"""The Alembic chain adds users.password_set_at / invited_at and user_tokens;
existing users count as "password already set"."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "c8f2a6d4e1b7"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_user(conn, user_id, email, created_at):
    conn.execute(
        sa.text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active, created_at) "
            "VALUES (:id, 'firm-1', :email, 'hash', 'Ad Soyad', 'lawyer', 1, :created_at)"
        ),
        {"id": user_id, "email": email, "created_at": created_at},
    )


def test_migration_marks_existing_users_as_password_set_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES ('firm-1', 'Büro', '2026-01-01 00:00:00')"))
        _insert_user(conn, "u-dated", "dated@example.com", "2026-03-04 05:06:07")
        _insert_user(conn, "u-second", "second@example.com", "2026-05-06 07:08:09")

    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    assert {"password_set_at", "invited_at"} <= {column["name"] for column in inspector.get_columns("users")}
    assert {column["name"] for column in inspector.get_columns("user_tokens")} >= {
        "id", "user_id", "law_firm_id", "purpose", "token_hash", "expires_at", "used_at", "created_by", "created_at",
    }
    indexes = {index["name"]: index for index in inspector.get_indexes("user_tokens")}
    assert {"ix_user_tokens_user_id", "ix_user_tokens_law_firm_id", "ix_user_tokens_token_hash"} <= set(indexes)
    assert indexes["ix_user_tokens_token_hash"]["unique"]

    with sa.create_engine(url).connect() as conn:
        rows = dict(conn.execute(sa.text("SELECT id, password_set_at FROM users")).all())
        assert str(rows["u-dated"]).startswith("2026-03-04 05:06:07")
        assert str(rows["u-second"]).startswith("2026-05-06 07:08:09")
        assert conn.execute(sa.text("SELECT COUNT(*) FROM users WHERE invited_at IS NOT NULL")).scalar_one() == 0

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert "user_tokens" not in inspector.get_table_names()
    assert not ({"password_set_at", "invited_at"} & {column["name"] for column in inspector.get_columns("users")})
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar_one() == 2
