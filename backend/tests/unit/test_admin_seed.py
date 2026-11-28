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


def test_reseed_survives_an_open_demo_case_without_a_next_hearing(monkeypatch):
    from app.models.case import CaseStatus
    from app.models.task import Task

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "SessionLocal", Session)
    monkeypatch.setattr(seed_module.settings, "seed_demo_data", True)
    title = "Duruşma ve süre takibini güncelle"
    try:
        seed_module.seed()
        with Session() as db:
            # A hearing that passed or was removed in the app leaves an open case without a date.
            case = db.query(Case).filter(Case.status != CaseStatus.KAPALI, Case.next_hearing_date.isnot(None),
                                         Case.case_number != "2026/153").first()
            case.next_hearing_date = None
            db.query(Task).filter(Task.case_id == case.id, Task.title == title).delete()
            db.commit()
            case_id = case.id
        seed_module.seed()
        with Session() as db:
            task = db.query(Task).filter(Task.case_id == case_id, Task.title == title).one()
            assert task.description.startswith("Sonraki duruşma tarihi kayıtlı değil.")
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
