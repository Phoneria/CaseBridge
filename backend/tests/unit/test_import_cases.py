import json

import pytest

from app.db.import_cases import import_folder
from app.models.case import Case, CaseEvent, CaseStatus, CaseType
from app.models.document import Document
from app.models.task import Task


@pytest.fixture()
def seeded(db_session):
    from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name=DEMO_FIRM_NAME)
    db_session.add(firm)
    db_session.flush()
    db_session.add(User(law_firm_id=firm.id, email=LAWYER_EMAIL, hashed_password="x", full_name="A",
                        role=UserRole.LAWYER, is_active=True))
    db_session.commit()
    return firm


def _write(folder, cases, files=None):
    (folder / "documents").mkdir(parents=True, exist_ok=True)
    for name, content in (files or {}).items():
        (folder / "documents" / name).write_bytes(content)
    (folder / "cases.json").write_text(json.dumps({"cases": cases}, ensure_ascii=False), encoding="utf-8")


CASE = {
    "case_number": "2024/101",
    "case_name": "Kıdem tazminatı alacağı",
    "client_name": "Davacı (anonim)",
    "opposing_party": "Davalı Şirket",
    "case_type": "is_hukuku",
    "court": "Yargıtay 9. Hukuk Dairesi",
    "opening_date": "2023-05-10",
    "status": "kapali",
    "outcome": "won",
    "description": "Özet",
    "events": [{"title": "Karar verildi", "event_type": "hearing", "event_date": "2024-02-01"}],
    "tasks": [{"title": "Kararı müvekkile ilet", "due_date": "2024-02-10"}],
    "documents": [
        {"file": "karar.txt"},
        {"filename": "ozet.txt", "text": "Kısa özet metni"},
    ],
}


def test_imports_case_with_documents_events_tasks(db_session, seeded, tmp_path):
    _write(tmp_path, [CASE], {"karar.txt": "Karar metni".encode()})
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats == {"created": 1, "updated": 0, "documents": 2, "errors": []}

    case = db_session.query(Case).one()
    assert case.case_type == CaseType.IS_HUKUKU
    assert case.status == CaseStatus.KAPALI
    texts = {d.filename: d.extracted_text for d in db_session.query(Document).all()}
    assert texts == {"karar.txt": "Karar metni", "ozet.txt": "Kısa özet metni"}
    assert db_session.query(CaseEvent).count() == 1
    assert db_session.query(Task).count() == 1


def test_import_is_idempotent(db_session, seeded, tmp_path):
    _write(tmp_path, [CASE], {"karar.txt": b"x"})
    import_folder(str(tmp_path), db=db_session)
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 0 and stats["updated"] == 1 and stats["documents"] == 0
    assert db_session.query(Case).count() == 1
    assert db_session.query(Document).count() == 2


def test_bad_case_is_reported_and_others_import(db_session, seeded, tmp_path):
    bad = {**CASE, "case_number": "2024/102", "case_type": "uzay_hukuku", "documents": []}
    good = {**CASE, "documents": []}
    _write(tmp_path, [bad, good])
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 1
    assert len(stats["errors"]) == 1 and "uzay_hukuku" in stats["errors"][0]
    assert db_session.query(Case).one().case_number == "2024/101"


def test_missing_document_file_is_an_error(db_session, seeded, tmp_path):
    _write(tmp_path, [{**CASE, "documents": [{"file": "yok.pdf"}]}])
    stats = import_folder(str(tmp_path), db=db_session)
    assert stats["created"] == 0 and "yok.pdf" in stats["errors"][0]


def test_seed_real_data_mode_removes_demo_cases(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker

    from app.core.config import settings
    from app.db import seed as seed_module

    engine = db_session.get_bind()
    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "SessionLocal", sessionmaker(bind=engine))

    seed_module.seed()
    assert db_session.query(Case).count() == len(seed_module.DEMO_CASES)

    real = Case(law_firm_id=db_session.query(Case).first().law_firm_id, case_number="GERCEK/1",
                case_name="Gerçek", client_name="Müvekkil", case_type=CaseType.DIGER)
    db_session.add(real)
    db_session.commit()

    monkeypatch.setattr(settings, "seed_demo_data", False)
    seed_module.seed()
    db_session.expire_all()
    assert [c.case_number for c in db_session.query(Case).all()] == ["GERCEK/1"]
    assert db_session.query(Document).count() == 0
