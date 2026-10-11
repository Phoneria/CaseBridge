"""After SEED_DEMO_DATA=false the importer targets a real firm and lawyer."""
import json

import pytest

from app.core.security import hash_password
from app.db.import_cases import ImportError_, import_folder
from app.models.case import Case
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole


@pytest.fixture()
def folder(tmp_path):
    manifest = {"cases": [{"case_number": "2026/1", "case_name": "Dava", "client_name": "Müvekkil", "case_type": "kira"}]}
    (tmp_path / "cases.json").write_text(json.dumps(manifest), encoding="utf-8")
    return str(tmp_path)


@pytest.fixture()
def real_office(db_session):
    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.flush()
    lawyer = User(law_firm_id=firm.id, email="Ayse@Example.com", hashed_password=hash_password("x"),
                  full_name="Ayşe", role=UserRole.LAWYER)
    db_session.add(lawyer)
    db_session.commit()
    return firm, lawyer


def test_import_into_a_named_firm_assigns_the_named_lawyer(db_session, folder, real_office):
    firm, lawyer = real_office

    stats = import_folder(folder, db=db_session, firm_name="Demir Hukuk", lawyer_email="ayse@example.com")

    assert stats["created"] == 1 and stats["errors"] == []
    case = db_session.query(Case).one()
    assert (case.law_firm_id, case.assigned_lawyer_id) == (firm.id, lawyer.id)


def test_import_without_the_demo_firm_explains_what_to_do(db_session, folder, real_office):
    with pytest.raises(ImportError_, match="--firm and --lawyer"):
        import_folder(folder, db=db_session)


def test_the_lawyer_must_belong_to_the_named_firm(db_session, folder, real_office):
    other = LawFirm(name="Kaya Hukuk")
    db_session.add(other)
    db_session.commit()
    with pytest.raises(ImportError_):
        import_folder(folder, db=db_session, firm_name="Kaya Hukuk", lawyer_email="ayse@example.com")
