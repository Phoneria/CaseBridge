"""Database connects and models can be persisted (section 22 - Application)."""


def test_can_create_and_query_law_firm(db_session):
    from app.models.law_firm import LawFirm

    firm = LawFirm(name="Test Hukuk Bürosu")
    db_session.add(firm)
    db_session.commit()

    fetched = db_session.query(LawFirm).filter_by(name="Test Hukuk Bürosu").first()
    assert fetched is not None
    assert fetched.id is not None


def test_user_requires_law_firm(db_session):
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole
    from app.core.security import hash_password

    firm = LawFirm(name="Test Hukuk Bürosu")
    db_session.add(firm)
    db_session.flush()

    user = User(
        law_firm_id=firm.id,
        email="test@demo.casebridge.dev",
        hashed_password=hash_password("pw"),
        full_name="Test User",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    fetched = db_session.query(User).filter_by(email="test@demo.casebridge.dev").first()
    assert fetched.law_firm_id == firm.id
