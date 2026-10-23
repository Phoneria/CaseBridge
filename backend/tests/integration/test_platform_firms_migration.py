"""The platform-firms revision adds the firm status, platform firm marker and
platform admin flag with defaults that keep every existing firm and user as
they were."""
from sqlalchemy import create_engine, inspect, text

from app.db.migrate import upgrade_to_head


def test_migration_adds_the_columns_with_safe_defaults(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'migrate.db'}")
    upgrade_to_head(engine)

    firm_columns = {column["name"] for column in inspect(engine).get_columns("law_firms")}
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert {"is_active", "suspended_at", "is_platform"} <= firm_columns
    assert "is_platform_admin" in user_columns

    with engine.begin() as connection:
        connection.execute(text("INSERT INTO law_firms (id, name, created_at) VALUES ('f1', 'Eski Büro', '2024-01-01 00:00:00')"))
        connection.execute(text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active, created_at) "
            "VALUES ('u1', 'f1', 'eski@example.com', 'x', 'Eski Kullanıcı', 'lawyer', 1, '2024-01-01 00:00:00')"
        ))
        firm = connection.execute(text("SELECT is_active, is_platform, suspended_at FROM law_firms")).one()
        user = connection.execute(text("SELECT is_platform_admin FROM users")).one()
    assert tuple(firm) == (1, 0, None)
    assert tuple(user) == (0,)


def test_new_firms_and_users_get_the_defaults(db_session):
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Yeni Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="yeni@example.com", hashed_password="x", full_name="Yeni", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.commit()

    assert (firm.is_active, firm.suspended_at, firm.is_platform) == (True, None, False)
    assert user.is_platform_admin is False


def test_me_reports_the_platform_admin_flag(client, office, auth_headers):
    body = client.get("/users/me", headers=auth_headers(office.admin_a)).json()
    assert body["is_platform_admin"] is False
