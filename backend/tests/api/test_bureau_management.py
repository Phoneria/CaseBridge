"""Security and workflow tests use only synthetic, isolated bureau records."""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.core.timeutil import local_today
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseType
from app.models.management import FirmProfile, ManagementAudit, ManagementRecord, WorkspaceAccess
from app.models.task import Task, TaskStatus
from app.models.user import UserRole


@pytest.fixture()
def data(db_session, office, auth_headers):
    a = Case(law_firm_id=office.firm_a.id, case_number="CB-A", case_name="Sentetik A", client_name="Örnek Müvekkil", opposing_party="Örnek Karşı Taraf", case_type=CaseType.DIGER, assigned_lawyer_id=office.lawyer_a1.id)
    b = Case(law_firm_id=office.firm_b.id, case_number="CB-B", case_name="Sentetik B", client_name="Diğer Büro Müvekkili", case_type=CaseType.DIGER)
    db_session.add_all([a, b])
    db_session.commit()
    return {"a": a, "b": b, "admin": auth_headers(office.admin_a), "other": auth_headers(office.admin_b), "lawyer": auth_headers(office.lawyer_a1), "reviewer": auth_headers(office.lawyer_a2)}


def body(kind="finance", **over):
    payload = {"kind": kind, "title": "Sentetik kayıt", "status": "recorded", "data": {"entry_type": "fee", "amount": "1250.50", "currency": "TRY", "entry_date": local_today().isoformat()}}
    payload.update(over)
    return payload


def create(client, headers, payload):
    result = client.post("/bureau/records", json=payload, headers=headers)
    assert result.status_code == 201, result.text
    return result.json()


def editable(row, **over):
    payload = {key: row[key] for key in ["kind", "title", "status", "case_id", "owner_id", "due_date", "data", "version"]}
    payload.update(over)
    return payload


def test_management_requires_admin_and_isolates_all_record_operations(client, data):
    for path in ["/bureau/overview", "/bureau/records", "/bureau/audit", "/bureau/access", "/bureau/ai-usage"]:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=data["lawyer"]).status_code == 403
    row = create(client, data["admin"], body(case_id=data["a"].id))
    assert client.get("/bureau/records", headers=data["other"]).json() == []
    assert client.put(f"/bureau/records/{row['id']}", headers=data["other"], json=editable(row)).status_code == 404
    for action in ["trash", "restore"]:
        assert client.post(f"/bureau/records/{row['id']}/{action}", headers=data["other"], json={"version": 1, "reason": "Test izolasyonu"}).status_code == 404
    assert client.get("/bureau/audit", headers=data["other"]).json()["total"] == 0


def test_rejects_tenant_fields_and_cross_firm_references(client, data, office):
    assert client.post("/bureau/records", headers=data["admin"], json=body(case_id=data["a"].id, law_firm_id=office.firm_b.id)).status_code == 422
    assert client.post("/bureau/records", headers=data["admin"], json=body(case_id=data["b"].id)).status_code == 404
    assert client.post("/bureau/records", headers=data["admin"], json=body(case_id=data["a"].id, owner_id=office.lawyer_b.id)).status_code == 404
    response = client.put(f"/bureau/access/{office.lawyer_b.id}", headers=data["admin"], json={"position": "client", "case_ids": [], "reason": "Sentetik erişim"})
    assert response.status_code == 404
    assert client.put(f"/bureau/access/{office.lawyer_a1.id}", headers=data["admin"], json={"position": "client", "case_ids": [data["a"].id], "reason": "Dönüştürme denemesi"}).status_code == 409


@pytest.mark.parametrize("amount", ["-1", "0", "NaN", "Infinity", "1.001", "1000000000000"])
def test_finance_rejects_invalid_amounts(client, data, amount):
    payload = body(case_id=data["a"].id)
    payload["data"]["amount"] = amount
    assert client.post("/bureau/records", headers=data["admin"], json=payload).status_code == 422


def test_finance_separates_currencies_advances_and_costs(client, data, office):
    for kind, amount, currency in [("fee", "1000.25", "TRY"), ("payment", "250.10", "TRY"), ("expense", "100.00", "TRY"), ("reimbursement", "30.00", "TRY"), ("advance", "500.00", "TRY"), ("advance_spend", "50.00", "TRY"), ("fee", "100.00", "USD")]:
        payload = body(case_id=data["a"].id)
        payload["data"].update(entry_type=kind, amount=amount, currency=currency)
        create(client, data["admin"], payload)
    create(client, data["admin"], body("time", case_id=data["a"].id, owner_id=office.lawyer_a1.id, data={"work_date": local_today().isoformat(), "minutes": 90, "hourly_cost": "100.00", "currency": "TRY"}))
    summary = client.get("/bureau/overview", headers=data["admin"]).json()
    groups = {r["currency"]: r for r in summary["finance"]}
    assert groups["TRY"]["fee_balance"] == "750.15"
    assert groups["TRY"]["expense_balance"] == "70.00"
    assert groups["TRY"]["advance_balance"] == "450.00"
    assert groups["TRY"]["labor_cost"] == "150.00"
    assert groups["TRY"]["estimated_margin"] == "780.25"
    assert groups["USD"]["fee_balance"] == "100.00"


def test_versions_trash_restore_and_audit_are_atomic(client, data, db_session):
    row = create(client, data["admin"], body(case_id=data["a"].id))
    updated = client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row, title="Güncellendi"))
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row)).status_code == 409
    deleted = client.post(f"/bureau/records/{row['id']}/trash", headers=data["admin"], json={"version": 2, "reason": "Yanlış kayıt"})
    assert deleted.status_code == 200
    assert client.get("/bureau/records", headers=data["admin"]).json() == []
    assert client.get("/bureau/overview", headers=data["admin"]).json()["finance"] == []
    assert len(client.get("/bureau/records?deleted=true", headers=data["admin"]).json()) == 1
    restored = client.post(f"/bureau/records/{row['id']}/restore", headers=data["admin"], json={"version": deleted.json()["version"], "reason": "Doğrulandı"})
    assert restored.status_code == 200, restored.text
    assert len(client.get("/bureau/overview", headers=data["admin"]).json()["finance"]) == 1
    history = client.get("/bureau/audit", headers=data["admin"]).json()
    assert history["total"] == 4
    assert {r["action"] for r in history["rows"]} == {"record.created", "record.updated", "record.trashed", "record.restored"}


def test_approval_requires_draft_assigned_reviewer_and_immutable_content(client, data, office):
    payload = body("approval", case_id=data["a"].id, owner_id=office.lawyer_a2.id, status="draft", data={"content": "İlk taslak"})
    assert client.post("/bureau/records", headers=data["admin"], json={**payload, "status": "approved"}).status_code == 422
    row = create(client, data["admin"], payload)
    row = client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row, status="review")).json()
    workspace = client.get("/bureau/workspace", headers=data["reviewer"]).json()
    assert row["id"] in {r["id"] for r in workspace["records"]}
    assert client.post(f"/bureau/workspace/records/{row['id']}/decision", headers=data["lawyer"], json={"version": row["version"], "status": "approved", "note": "Uygun"}).status_code == 403
    accepted = client.post(f"/bureau/workspace/records/{row['id']}/decision", headers=data["reviewer"], json={"version": row["version"], "status": "approved", "note": "İncelendi ve uygun bulundu"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "approved"
    assert client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(accepted.json(), title="Değişsin")).status_code == 409


def test_scoped_accounts_cannot_use_legacy_search_export_ai_or_other_cases(client, data, office):
    for position in ["client", "trainee", "secretary", "accountant", "consultant", "lawyer"]:
        result = client.put(f"/bureau/access/{office.lawyer_a2.id}", headers=data["admin"], json={"position": position, "case_ids": [data["a"].id], "reason": "Sentetik dosya yetkisi"})
        assert result.status_code == 200
        for path in ["/cases", f"/cases/{data['a'].id}", "/documents", "/reports/cases.csv", "/system/openai-key", "/chat/conversations", "/users", "/admin/users", "/bureau/overview", "/platform/firms"]:
            assert client.get(path, headers=data["reviewer"]).status_code == 403, (position, path)
        assert client.get("/users/me", headers=data["reviewer"]).json()["workspace_position"] == position
        workspace = client.get("/bureau/workspace", headers=data["reviewer"])
        assert workspace.status_code == 200, workspace.text
        assert data["b"].case_name not in workspace.text


def test_client_portal_only_published_audience_approved_documents_and_revocation(client, data, office, db_session):
    from app.models.document import Document, DocumentType
    from app.services.document_service import DocumentService
    doc = DocumentService(db_session).upload(case_id=data["a"].id, law_firm_id=office.firm_a.id, filename="Paylasilacak.txt", raw_bytes=b"Synthetic shared document", uploaded_by=office.admin_a.id)
    other_doc = Document(law_firm_id=office.firm_b.id, case_id=data["b"].id, filename="Gizli.txt", file_type=DocumentType.TXT, storage_path="missing")
    db_session.add_all([doc, other_doc]); db_session.commit()
    grant = {"position": "client", "case_ids": [data["a"].id], "reason": "Müvekkile dosya erişimi"}
    assert client.put(f"/bureau/access/{office.lawyer_a2.id}", headers=data["admin"], json=grant).status_code == 200
    create(client, data["admin"], body(case_id=data["a"].id, title="Gizli finans kaydı"))
    payload = body("publication", case_id=data["a"].id, status="draft", data={"audience_ids": [office.lawyer_a2.id], "document_ids": [doc.id], "message": "Paylaşılan gelişme"})
    row = create(client, data["admin"], payload)
    assert client.get("/bureau/workspace", headers=data["reviewer"]).json()["publications"] == []
    bad = editable(row, status="published", data={**row["data"], "document_ids": [other_doc.id]})
    assert client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=bad).status_code == 404
    assert client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row, status="published")).status_code == 200
    result = client.get("/bureau/workspace", headers=data["reviewer"])
    assert result.json()["publications"][0]["message"] == "Paylaşılan gelişme"
    assert result.json()["documents"][0]["id"] == doc.id
    assert "Gizli finans" not in result.text and "case_number" not in result.text and "extracted_text" not in result.text
    download = client.get(f"/bureau/workspace/documents/{doc.id}", headers=data["reviewer"])
    assert download.status_code == 200 and download.content == b"Synthetic shared document"
    assert download.headers["cache-control"] == "no-store"
    assert client.get(f"/bureau/workspace/documents/{other_doc.id}", headers=data["reviewer"]).status_code == 404
    assert client.put(f"/bureau/access/{office.lawyer_a2.id}", headers=data["admin"], json={**grant, "case_ids": []}).status_code == 200
    assert client.get("/bureau/workspace", headers=data["reviewer"]).json()["publications"] == []
    assert client.get(f"/bureau/workspace/documents/{doc.id}", headers=data["reviewer"]).status_code == 404


def test_deadline_validation_and_deduplicated_owner_backup_escalation(client, data, office, db_session):
    from app.core.config import settings
    from app.services.reminder_service import ReminderService
    from app.services.email import EmailMessage
    today = local_today()
    payload = body("deadline", case_id=data["a"].id, owner_id=office.lawyer_a1.id, due_date=today.isoformat(), status="open", data={"source": "Sentetik tebligat", "backup_id": office.lawyer_a2.id, "verified": False, "reminder_days": [0]})
    row = create(client, data["admin"], payload)
    assert client.post(f"/bureau/workspace/records/{row['id']}/decision", headers=data["lawyer"], json={"version": row["version"], "status": "acknowledged"}).status_code == 422
    assert not [r for r in ReminderService(db_session).collect_due(datetime.combine(today, datetime.max.time())) if r.source_id == row["id"]]
    result = client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row, data={**row["data"], "verified": True}))
    assert result.status_code == 200, result.text
    outbox = []
    service = ReminderService(db_session, sender=outbox.append)
    when = datetime.combine(today, datetime.max.time())
    service.send_due(when)
    assert len(outbox) == 2
    service.send_due(when)
    assert len(outbox) == 2
    service.send_due(when + timedelta(days=1))
    assert len(outbox) == 3  # one bureau administrator escalation
    service.send_due(when + timedelta(days=1))
    assert len(outbox) == 3


def test_checklist_dependencies_and_scoped_completion(client, data, office):
    payload = body("checklist", case_id=data["a"].id, owner_id=office.lawyer_a1.id, status="open", data={"items": [{"title": "Belge kontrolü"}, {"title": "Son kontrol", "depends_on": 0}]})
    row = create(client, data["admin"], payload)
    endpoint = f"/bureau/workspace/records/{row['id']}/step"
    assert client.post(endpoint, headers=data["lawyer"], json={"version": row["version"], "index": 1, "done": True}).status_code == 422
    first = client.post(endpoint, headers=data["lawyer"], json={"version": row["version"], "index": 0, "done": True})
    assert first.status_code == 200, first.text
    second = client.post(endpoint, headers=data["lawyer"], json={"version": first.json()["version"], "index": 1, "done": True})
    assert second.json()["status"] == "completed"
    undone = client.post(endpoint, headers=data["lawyer"], json={"version": second.json()["version"], "index": 0, "done": False})
    assert undone.json()["status"] == "open"
    assert not undone.json()["data"]["items"][1]["done"]


def test_leave_overlap_and_atomic_transfer_preserve_active_account(client, data, office, db_session):
    today = local_today()
    payload = body("leave", owner_id=office.lawyer_a1.id, status="approved", data={"starts_on": today.isoformat(), "ends_on": (today + timedelta(days=3)).isoformat(), "backup_id": office.lawyer_a2.id})
    row = create(client, data["admin"], payload)
    assert client.put(f"/bureau/records/{row['id']}", headers=data["admin"], json=editable(row)).status_code == 200
    assert client.post("/bureau/records", headers=data["admin"], json=payload).status_code == 409
    task = Task(law_firm_id=office.firm_a.id, case_id=data["a"].id, title="Devredilen görev", assigned_to=office.lawyer_a1.id, due_date=today)
    db_session.add(task);db_session.commit()
    result = client.post(f"/bureau/transfer/{office.lawyer_a1.id}", headers=data["admin"], json={"target_id": office.lawyer_a2.id, "reason": "İzin süresince devir"})
    assert result.status_code == 200, result.text
    assert result.json()["cases"] == 1 and result.json()["tasks"] == 1
    db_session.expire_all()
    assert db_session.get(Case, data["a"].id).assigned_lawyer_id == office.lawyer_a2.id
    assert db_session.get(Task, task.id).assigned_to == office.lawyer_a2.id
    assert office.lawyer_a1.is_active
    receipts = client.get("/bureau/transfers", headers=data["admin"]).json()
    assert len(receipts) == 1 and receipts[0]["accepted_at"] is None
    endpoint = f"/bureau/workspace/transfers/{receipts[0]['id']}/accept"
    assert client.post(endpoint, headers=data["other"]).status_code == 404
    assert client.post(endpoint, headers=data["lawyer"]).status_code == 404
    assert client.post(endpoint, headers=data["reviewer"]).status_code == 200
    assert client.post(endpoint, headers=data["reviewer"]).status_code == 200
    db_session.expire_all()
    assert db_session.query(ManagementAudit).filter(ManagementAudit.action == "work.accepted").count() == 1


def test_conflict_search_is_firm_scoped_and_lead_gates_contract(client, data):
    response = client.get("/bureau/conflicts?q=Örnek", headers=data["admin"])
    assert response.status_code == 200
    assert len(response.json()["matches"]) == 2
    assert data["b"].case_name not in response.text
    payload = body("lead", status="contract", data={"client_name": "Yeni Müvekkil"})
    assert client.post("/bureau/records", headers=data["admin"], json=payload).status_code == 422
    payload["data"].update(conflict_decision="clear", conflict_reason="Sentetik kayıtlar incelendi")
    assert client.post("/bureau/records", headers=data["admin"], json=payload).status_code == 201


def test_ai_budget_is_bureau_scoped_without_touching_credentials(client, data):
    usage = client.get("/bureau/ai-usage", headers=data["admin"])
    assert usage.status_code == 200, usage.text
    payload = {"version": usage.json()["version"], "token_budget": 1000, "cost_per_million": "5.5000", "currency": "USD"}
    updated = client.put("/bureau/ai-budget", headers=data["admin"], json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["policy"]["token_budget"] == 1000
    assert client.get("/bureau/ai-usage", headers=data["other"]).json()["policy"]["token_budget"] == 0
    assert client.put("/bureau/ai-budget", headers=data["admin"], json=payload).status_code == 409
