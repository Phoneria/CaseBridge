"""The sample template is firm-scoped and safe to request more than once."""
from app.db.seed import DEMO_CASES
from app.models.case import Case, CaseEvent, CaseType
from app.models.document import Document
from app.models.task import Task


def test_admin_imports_sample_portfolio_only_into_own_firm(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    first = client.post("/admin/demo-template", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json() == {"total_cases": len(DEMO_CASES), "added_cases": len(DEMO_CASES)}
    cases = db_session.query(Case).filter(Case.law_firm_id == office.firm_a.id).all()
    assert len(cases) == len(DEMO_CASES)
    assert all(case.case_number.startswith("ÖRNEK-") for case in cases)
    assert all(case.assigned_lawyer_id in (office.lawyer_a1.id, office.lawyer_a2.id) for case in cases)
    assert db_session.query(Case).filter(Case.law_firm_id == office.firm_b.id).count() == 0

    counts = tuple(db_session.query(model).filter(model.law_firm_id == office.firm_a.id).count()
                   for model in (Case, Task, Document, CaseEvent))
    assert all(count > 0 for count in counts)
    second = client.post("/admin/demo-template", headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["added_cases"] == 0
    assert counts == tuple(db_session.query(model).filter(model.law_firm_id == office.firm_a.id).count()
                           for model in (Case, Task, Document, CaseEvent))

    assert client.post("/admin/demo-template", headers=auth_headers(office.lawyer_a1)).status_code == 403


def test_real_case_number_collision_aborts_without_changes(client, db_session, office, auth_headers):
    real_case = Case(
        law_firm_id=office.firm_a.id, case_number="ÖRNEK-" + DEMO_CASES[0]["case_number"],
        case_name="Gerçek dava", client_name="Gerçek müvekkil", case_type=CaseType.KIRA,
        description="Gerçek kayıt",
    )
    db_session.add(real_case)
    db_session.commit()

    response = client.post("/admin/demo-template", headers=auth_headers(office.admin_a))
    assert response.status_code == 409
    assert db_session.query(Case).filter(Case.law_firm_id == office.firm_a.id).count() == 1
    db_session.refresh(real_case)
    assert real_case.description == "Gerçek kayıt"


def test_new_firm_with_only_admin_can_import_examples(client, db_session, office, auth_headers):
    office.lawyer_a1.is_active = False
    office.lawyer_a2.is_active = False
    db_session.commit()

    response = client.post("/admin/demo-template", headers=auth_headers(office.admin_a))
    assert response.status_code == 200, response.text
    cases = db_session.query(Case).filter(Case.law_firm_id == office.firm_a.id).all()
    assert len(cases) == len(DEMO_CASES)
    assert all(case.assigned_lawyer_id == office.admin_a.id for case in cases)
