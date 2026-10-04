from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db import seed as seed_module
from app.models.case import Case
from app.models.user import User, UserRole


def test_seed_has_three_named_lawyers_and_assigns_every_demo_case(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    monkeypatch.setattr(seed_module.settings, "seed_demo_data", True)
    try:
        seed_module.seed()
        seed_module.seed()
        with Session() as db:
            lawyers = db.query(User).filter(User.role == UserRole.LAWYER).all()
            assert {(u.full_name, u.department, u.gender) for u in lawyers} == {
                ("Emre Yılmaz", "Ticaret Hukuku", "male"),
                ("Kerem Demir", "İş Hukuku", "male"),
                ("Zeynep Arslan", "Kira ve Gayrimenkul Hukuku", "female"),
            }
            cases = db.query(Case).all()
            assert len(cases) == len(seed_module.DEMO_CASES)
            assert all(c.assigned_lawyer_id in {u.id for u in lawyers} for c in cases)
            assert len({c.assigned_lawyer_id for c in cases}) == 3
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
