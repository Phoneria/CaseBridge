"""The Alembic chain adds the hearing result columns and turns every case's
next_hearing_date into a real hearing event (see the migration's docstring)."""
import logging
from datetime import datetime, timedelta
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings
from app.core.timeutil import local_today

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "e6c1b9a4d2f8"
CREATED = "2026-01-01 00:00:00"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _firm(conn, firm_id):
    conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES (:id, :id, :created)"), {"id": firm_id, "created": CREATED})


def _user(conn, user_id, firm_id, role, created=CREATED, active=True):
    conn.execute(
        sa.text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active, created_at) "
            "VALUES (:id, :firm, :email, 'x', :id, :role, :active, :created)"
        ),
        {"id": user_id, "firm": firm_id, "email": f"{user_id}@test", "role": role, "active": active, "created": created},
    )


def _case(conn, case_id, firm_id, lawyer=None, hearing=None, precedent=False):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, case_type, opening_date, "
            "status, outcome, is_archived, is_precedent, assigned_lawyer_id, next_hearing_date, created_at, updated_at) "
            "VALUES (:id, :firm, :id, 'Dava', 'Müvekkil', 'kira', '2026-01-01', 'devam_eden', 'ongoing', 0, :precedent, "
            ":lawyer, :hearing, :created, :created)"
        ),
        {"id": case_id, "firm": firm_id, "lawyer": lawyer, "hearing": hearing, "precedent": precedent, "created": CREATED},
    )


def _event(conn, event_id, firm_id, case_id, starts_at, user_id, all_day=False):
    conn.execute(
        sa.text(
            "INSERT INTO calendar_events (id, law_firm_id, title, event_type, starts_at, all_day, duration_minutes, "
            "case_id, created_by, reminder_days, created_at, updated_at) "
            "VALUES (:id, :firm, 'Duruşma', 'hearing', :starts, :all_day, 60, :case, :user, '[3, 1]', :created, :created)"
        ),
        {"id": event_id, "firm": firm_id, "starts": starts_at, "all_day": all_day, "case": case_id, "user": user_id, "created": CREATED},
    )


def test_migration_converts_case_hearing_dates_into_events(tmp_path, monkeypatch, caplog):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()
    today = local_today()
    soon = (today + timedelta(days=10)).isoformat()
    later = (today + timedelta(days=20)).isoformat()
    past = (today - timedelta(days=5)).isoformat()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        _firm(conn, "f1")
        _user(conn, "lawyer", "f1", "lawyer", created="2026-02-01 00:00:00")
        _user(conn, "admin-old", "f1", "admin", created="2026-01-05 00:00:00")
        _user(conn, "admin-new", "f1", "admin", created="2026-03-01 00:00:00")
        _firm(conn, "f2")
        _user(conn, "only-user", "f2", "lawyer", active=False)
        _firm(conn, "f3")
        _case(conn, "with-lawyer", "f1", lawyer="lawyer", hearing=soon)
        _case(conn, "already-has-event", "f1", lawyer="lawyer", hearing=soon)
        _event(conn, "existing-event", "f1", "already-has-event", f"{soon} 10:30:00", "lawyer")
        _case(conn, "no-lawyer", "f1", hearing=later)
        _case(conn, "fallback-user", "f2", hearing=later)
        _case(conn, "no-users", "f3", hearing=later)
        _case(conn, "past", "f1", lawyer="lawyer", hearing=past)
        _case(conn, "precedent", "f1", hearing=later, precedent=True)
        _case(conn, "stale-null", "f1", lawyer="lawyer")
        _event(conn, "upcoming-event", "f1", "stale-null", f"{later} 09:00:00", "lawyer")
        conn.execute(
            sa.text(
                "INSERT INTO reminder_deliveries (id, law_firm_id, source_type, source_id, occurrence_date, days_before, "
                "recipient_user_id, status, attempts, sent_at, created_at, updated_at) "
                "VALUES ('d1', 'f1', 'case_hearing', 'with-lawyer', :soon, 3, 'lawyer', 'sent', 1, :created, :created, :created)"
            ),
            {"soon": soon, "created": CREATED},
        )

    with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
        command.upgrade(config, "head")

    assert "no-users" in caplog.text
    with sa.create_engine(url).connect() as conn:
        events = {
            row.case_id: row
            for row in conn.execute(sa.text("SELECT * FROM calendar_events WHERE id != 'existing-event' AND id != 'upcoming-event'")).mappings()
        }
        assert set(events) == {"with-lawyer", "no-lawyer", "fallback-user", "past"}
        created = events["with-lawyer"]
        assert (created["title"], created["event_type"], bool(created["all_day"]), created["law_firm_id"]) == ("Duruşma", "hearing", True, "f1")
        assert str(created["starts_at"]).startswith(f"{soon} 00:00:00")
        assert (created["assignee_id"], created["created_by"], created["result_note"], created["result_case_event_id"]) == ("lawyer", "lawyer", None, None)
        assert created["reminder_days"] in ("[3, 1]", [3, 1])
        assert (events["no-lawyer"]["assignee_id"], events["no-lawyer"]["created_by"]) == (None, "admin-old")
        assert (events["fallback-user"]["assignee_id"], events["fallback-user"]["created_by"]) == (None, "only-user")
        assert str(events["past"]["starts_at"]).startswith(f"{past} 00:00:00")

        dates = dict(conn.execute(sa.text("SELECT id, next_hearing_date FROM cases")).all())
        assert dates == {
            "with-lawyer": soon,
            "already-has-event": soon,
            "no-lawyer": later,
            "fallback-user": later,
            "no-users": None,  # skipped (no user could own the event); the cache follows the events
            "past": None,
            "precedent": later,  # precedent cases are not on the calendar and stay as they were
            "stale-null": later,
        }

        copied = conn.execute(
            sa.text("SELECT source_type, source_id, days_before, status, recipient_user_id FROM reminder_deliveries WHERE source_type = 'event'")
        ).all()
        assert copied == [("event", created["id"], 3, "sent", "lawyer")]
        assert conn.execute(sa.text("SELECT COUNT(*) FROM reminder_deliveries")).scalar_one() == 2

        columns = {column["name"]: column for column in sa.inspect(conn).get_columns("calendar_events")}
        assert {"result_note", "result_case_event_id"} <= set(columns)

    command.downgrade(config, PREVIOUS_HEAD)
    with sa.create_engine(url).connect() as conn:
        assert not ({"result_note", "result_case_event_id"} & {c["name"] for c in sa.inspect(conn).get_columns("calendar_events")})
        assert conn.execute(sa.text("SELECT COUNT(*) FROM calendar_events")).scalar_one() == 6


def test_a_yesterday_hearing_is_kept_as_history_and_clears_the_cache(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()
    yesterday = (local_today() - timedelta(days=1)).isoformat()

    command.upgrade(config, PREVIOUS_HEAD)
    with sa.create_engine(url).begin() as conn:
        _firm(conn, "f1")
        _user(conn, "lawyer", "f1", "lawyer")
        _case(conn, "c1", "f1", lawyer="lawyer", hearing=yesterday)

    command.upgrade(config, "head")

    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT next_hearing_date FROM cases")).scalar_one() is None
        assert conn.execute(sa.text("SELECT COUNT(*) FROM calendar_events WHERE case_id = 'c1'")).scalar_one() == 1
