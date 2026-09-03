"""Shared pytest fixtures for the CaseBridge backend test suite.

All tests run against an isolated in-memory SQLite database per test
function and use the MockProvider for any AI calls (wired in later
milestones). No test in this suite should ever hit the network.
"""
import os
import sys

# Ensure required env vars exist before app.core.config is imported,
# even if the developer's shell has no .env loaded (e.g. CI).
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("LLM_PROVIDER", "mock")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def db_session():
    from app.db.base import Base
    import app.models  # noqa: F401  ensure all models are registered on Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _isolated_storage_dir(tmp_path, monkeypatch):
    """Every test writes uploaded documents to its own temp directory so
    test runs never accumulate files on disk or collide with each other."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "storage_dir", str(tmp_path / "storage"))


@pytest.fixture(autouse=True)
def _reset_login_rate_limiter():
    """The login rate limiter is in-process global state (see
    app/core/rate_limit.py's module docstring) - reset it before every
    test so one test's login attempts never rate-limit another."""
    from app.core.rate_limit import reset_all

    reset_all()
    yield
    reset_all()


@pytest.fixture()
def client(db_session):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.db.session import get_db

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def two_firms_two_users(db_session):
    """Seed two law firms, each with one lawyer user. Returns a dict of
    everything a test needs: firm/user objects and their plaintext
    passwords (for login flow tests)."""
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole
    from app.core.security import hash_password

    firm_a = LawFirm(name="Demo Hukuk Bürosu A")
    firm_b = LawFirm(name="Demo Hukuk Bürosu B")
    db_session.add_all([firm_a, firm_b])
    db_session.flush()

    user_a = User(
        law_firm_id=firm_a.id,
        email="avukat.a@demo.casebridge.dev",
        hashed_password=hash_password("password123"),
        full_name="Avukat A",
        role=UserRole.LAWYER,
        is_active=True,
    )
    user_b = User(
        law_firm_id=firm_b.id,
        email="avukat.b@demo.casebridge.dev",
        hashed_password=hash_password("password123"),
        full_name="Avukat B",
        role=UserRole.LAWYER,
        is_active=True,
    )
    db_session.add_all([user_a, user_b])
    db_session.commit()
    db_session.refresh(user_a)
    db_session.refresh(user_b)

    return {
        "firm_a": firm_a,
        "firm_b": firm_b,
        "user_a": user_a,
        "user_b": user_b,
        "password": "password123",
    }
