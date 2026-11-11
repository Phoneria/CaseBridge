"""The sample template is firm-scoped and safe to request more than once."""
from app.db.seed import DEMO_CASES
from app.models.case import Case, CaseEvent, CaseType
from app.models.document import Document
from app.models.task import Task


def test_admin_imports_sample_portfolio_only_into_own_firm(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    first = client.post("/admin/demo-template", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["total_cases"] == len(DEMO_CASES)
    assert first.json()["added_cases"] == len(DEMO_CASES)
    assert all(first.json()["coverage"].values())
    cases = db_session.query(Case).filter(Case.law_firm_id == office.firm_a.id, Case.is_precedent.is_(False)).all()
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
    cases = db_session.query(Case).filter(Case.law_firm_id == office.firm_a.id, Case.is_precedent.is_(False)).all()
    assert len(cases) == len(DEMO_CASES)
    assert all(case.assigned_lawyer_id == office.admin_a.id for case in cases)


def test_presentation_covers_workflows_and_readable_ai_history(client, db_session, office, auth_headers, monkeypatch):
    from app.models.management import ManagementRecord, WorkspaceAccess, FirmProfile
    from app.models.chat import ChatConversation
    from app.models.simulation import Simulation, AIAnalysis
    from app.models.courtroom import CourtroomSession, CourtroomSessionStatus
    from app.db.demo_presentation_seed import identity
    from app.schemas.management import RecordWrite
    from app.services.auth_service import AuthService
    from app.core.timeutil import local_today
    from app.core.config import settings
    from pathlib import Path

    # Any attempted outgoing invite or provider usage is a test failure.
    def forbidden(*args, **kwargs):
        raise AssertionError("Presentation import must not contact external services")
    monkeypatch.setattr("app.services.account_service.deliver", forbidden)
    headers = auth_headers(office.admin_a)
    result = client.post("/admin/demo-template", headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["added_records"] > 100
    assert result.json()["coverage"]["Emsaller"] == 3
    assert db_session.query(Case).filter_by(law_firm_id=office.firm_a.id,is_precedent=False,is_archived=True).count()==1
    rows = db_session.query(ManagementRecord).filter_by(law_firm_id=office.firm_a.id).all()
    assert {r.kind for r in rows} >= {"finance","time","client","communication","lead","approval","deadline","checklist","leave","publication","support"}
    for row in rows:
        RecordWrite(kind=row.kind, title=row.title, status=row.status, case_id=row.case_id, owner_id=row.owner_id, due_date=row.due_date, data=row.data)
    assert any(r.deleted_at for r in rows)
    assert {r.status for r in rows if r.kind=="support" and not r.deleted_at} == {"open","in_progress","resolved"}
    from app.models.calendar import CalendarEvent
    assert all(t.reminder_days == [] for t in db_session.query(Task).filter_by(law_firm_id=office.firm_a.id))
    assert all(e.reminder_days == [] for e in db_session.query(CalendarEvent).filter_by(law_firm_id=office.firm_a.id))
    assert all(r.data["reminder_days"]==[] for r in rows if r.kind=="deadline")
    assert all(r.status=="requested" for r in rows if r.kind=="leave")
    assert {r.status for r in rows if r.kind == "approval"} == {"draft","review","changes","approved"}
    assert {r.data["entry_type"] for r in rows if r.kind == "finance"} == {"fee","payment","expense","reimbursement","advance","advance_spend"}
    assert any(r.due_date and r.due_date < local_today() for r in rows)
    assert any(r.due_date and r.due_date > local_today() for r in rows)
    assert db_session.query(WorkspaceAccess).filter_by(law_firm_id=office.firm_a.id).count() == 6
    from app.models.user import User
    demo_lawyer = db_session.get(User, identity(office.firm_a.id,"member:lawyer"))
    assert demo_lawyer.is_platform_admin is False
    assert AuthService(db_session).authenticate(demo_lawyer.email, "demo1234") is None
    assert demo_lawyer.invited_at is None
    grants=db_session.query(WorkspaceAccess).filter_by(law_firm_id=office.firm_a.id).all()
    sample_ids={c.id for c in db_session.query(Case).filter(Case.law_firm_id==office.firm_a.id,Case.case_number.like("ÖRNEK-%"))}
    assert all(set(g.case_ids) <= sample_ids for g in grants)
    assert db_session.query(Simulation).filter_by(law_firm_id=office.firm_a.id).count() == len(DEMO_CASES)
    assert db_session.query(AIAnalysis).filter_by(law_firm_id=office.firm_a.id).count() == len(DEMO_CASES)
    assert db_session.query(ChatConversation).filter_by(law_firm_id=office.firm_a.id, user_id=office.admin_a.id).count() == 3
    assert db_session.query(CourtroomSession).filter_by(law_firm_id=office.firm_a.id, status=CourtroomSessionStatus.ACTIVE).count() == 1
    documents=db_session.query(Document).filter_by(law_firm_id=office.firm_a.id).all()
    assert all(Path(d.storage_path).is_file() for d in documents)
    assert all(Path(d.storage_path).is_relative_to(Path(settings.storage_dir)) for d in documents)
    for path in ["/simulations","/chat/conversations","/bureau/overview","/bureau/ai-usage","/bureau/records","/precedents","/reports/summary"]:
        response=client.get(path,headers=headers)
        assert response.status_code==200,(path,response.text)
    usage=client.get("/bureau/ai-usage",headers=headers).json()
    assert usage["used_tokens"] > 0
    assert "Kurgusal gösterim" in usage["coverage"]
    chats=client.get("/chat/conversations",headers=headers).json()
    assert len(client.get(f"/chat/conversations/{chats[0]['id']}",headers=headers).json()["messages"])==2
    sims=client.get("/simulations",headers=headers).json()
    assert all(s["result"]["recommended_actions"] and s["result"]["requires_verification"] for s in sims)
    # The second firm still has no presentation workflow, AI history or access grants.
    for model in [ManagementRecord,WorkspaceAccess,Simulation,ChatConversation]:
        assert db_session.query(model).filter_by(law_firm_id=office.firm_b.id).count()==0
    snapshot=result.json()["coverage"]
    again=client.post("/admin/demo-template",headers=headers).json()
    assert again["added_records"]==0
    assert again["coverage"]==snapshot
    # Missing modules of an earlier/partially deleted template are repaired.
    db_session.delete(db_session.get(Simulation,identity(office.firm_a.id,f"analysis:{sims[0]['case_id']}")))
    db_session.commit()
    repaired=client.post("/admin/demo-template",headers=headers)
    assert repaired.status_code==200,repaired.text
    assert repaired.json()["added_cases"]==0 and repaired.json()["added_records"]>0


def test_import_preserves_real_records_budget_and_does_not_touch_other_firms(client, db_session, office, auth_headers):
    from app.models.management import FirmProfile
    from app.models.calendar import CalendarEvent
    from app.models.user import User
    real=Case(law_firm_id=office.firm_a.id,case_number="REAL-1",case_name="Gerçek kayıt",client_name="Gerçek kişi",case_type=CaseType.KIRA,description="Değiştirilmemeli")
    profile=FirmProfile(law_firm_id=office.firm_a.id,data={"email":"real@example.com","ai_budget":{"token_budget":123,"cost_per_million":"7","currency":"TRY"}})
    db_session.add_all([real,profile]);db_session.commit()
    response=client.post("/admin/demo-template",headers=auth_headers(office.admin_a))
    assert response.status_code==200,response.text
    db_session.refresh(real);db_session.refresh(profile)
    assert real.claim is None and real.description=="Değiştirilmemeli"
    assert profile.data=={"email":"real@example.com","ai_budget":{"token_budget":123,"cost_per_million":"7","currency":"TRY"}}
    assert db_session.query(User).filter_by(law_firm_id=office.firm_b.id).count()==2
    assert db_session.query(CalendarEvent).filter_by(law_firm_id=office.firm_b.id).count()==0


def test_existing_scoped_client_is_never_a_sample_case_owner(client, db_session, office, auth_headers):
    from app.models.management import WorkspaceAccess
    db_session.add(WorkspaceAccess(law_firm_id=office.firm_a.id,user_id=office.lawyer_a1.id,position="client",case_ids=[]))
    db_session.commit()
    response=client.post("/admin/demo-template",headers=auth_headers(office.admin_a))
    assert response.status_code==200,response.text
    assert db_session.query(Case).filter_by(law_firm_id=office.firm_a.id,assigned_lawyer_id=office.lawyer_a1.id).count()==0
