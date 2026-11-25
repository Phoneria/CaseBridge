"""Routes added to main after the first audit pass record metadata only."""
from datetime import timedelta

from app.core.timeutil import local_today
from app.models.case import Case, CaseType
from app.models.task import Task, TaskStatus
from tests.api.audit_helpers import audit_rows

SECRET = "GİZLİ-İÇERİK"


def _case(db_session, office, **over):
    row = Case(law_firm_id=office.firm_a.id, case_number=over.pop("number", "A/1"), case_name=SECRET,
               client_name=SECRET, case_type=CaseType.KIRA, assigned_lawyer_id=office.lawyer_a1.id, **over)
    db_session.add(row)
    db_session.commit()
    return row


def test_precedent_link_and_unlink_are_recorded_once(client, db_session, office, auth_headers):
    case = _case(db_session, office)
    precedent = _case(db_session, office, number="P/1", is_precedent=True)
    headers = auth_headers(office.admin_a)
    path = f"/cases/{case.id}/precedents/{precedent.id}"
    for _ in range(2):
        assert client.put(path, headers=headers).status_code == 204
    [linked] = audit_rows(db_session, "case.precedent_linked")
    assert (linked.case_id, linked.target_type, linked.target_id) == (case.id, "precedent", precedent.id)
    for _ in range(2):
        assert client.delete(path, headers=headers).status_code == 204
    assert len(audit_rows(db_session, "case.precedent_unlinked")) == 1


def test_late_decision_records_the_outcome_transition(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = client.post("/cases", headers=headers, json={
        "case_number": "D/1", "case_name": SECRET, "client_name": SECRET, "case_type": "kira", "status": "kapali",
        "opening_date": (local_today() - timedelta(days=30)).isoformat()}).json()
    response = client.post(f"/cases/{case['id']}/decision", headers=headers, json={
        "outcome": "won", "decision_date": (local_today() - timedelta(days=1)).isoformat(), "note": SECRET})
    assert response.status_code == 200, response.text
    [row] = audit_rows(db_session, "case.decision_recorded")
    assert row.details == {"transitions": {"outcome": ["ongoing", "won"]}}


def test_legal_lab_calls_record_source_and_turn_count(client, db_session, office, auth_headers):
    case = _case(db_session, office)
    headers = auth_headers(office.lawyer_a1)
    assert client.post("/legal-lab/counter-analysis", headers=headers, json={"summary": SECRET}).status_code == 200
    turns = [{"who": "hakim", "text": SECRET}]
    assert client.post("/legal-lab/trial/ask", headers=headers,
                       json={"case_id": case.id, "question": SECRET, "transcript": turns}).status_code == 200
    [counter] = audit_rows(db_session, "ai.counter_analysis")
    assert counter.details == {"flags": {"source": "text"}} and counter.case_id is None
    [ask] = audit_rows(db_session, "ai.trial_ask")
    assert ask.case_id == case.id and ask.details == {"counts": {"moves": 1}, "flags": {"source": "case"}}


def test_bureau_records_and_workspace_task_are_recorded(client, db_session, office, auth_headers):
    case = _case(db_session, office)
    admin = auth_headers(office.admin_a)
    row = client.post("/bureau/records", headers=admin, json={
        "kind": "finance", "title": SECRET, "status": "recorded", "case_id": case.id,
        "data": {"entry_type": "fee", "amount": "10.00", "currency": "TRY", "entry_date": local_today().isoformat()}})
    assert row.status_code == 201, row.text
    row = row.json()
    trashed = client.post(f"/bureau/records/{row['id']}/trash", headers=admin, json={"version": row["version"], "reason": SECRET})
    assert trashed.status_code == 200, trashed.text
    restored = client.post(f"/bureau/records/{row['id']}/restore", headers=admin,
                           json={"version": trashed.json()["version"], "reason": SECRET})
    assert restored.status_code == 200, restored.text
    actions = [r.action for r in audit_rows(db_session) if r.target_type == "record"]
    assert actions == ["record.created", "record.trashed", "record.restored"]
    assert all(r.details == {"flags": {"record_kind": "finance"}} and r.case_id == case.id
               for r in audit_rows(db_session) if r.target_type == "record")

    task = Task(case_id=case.id, law_firm_id=office.firm_a.id, title=SECRET, assigned_to=office.lawyer_a1.id)
    db_session.add(task)
    db_session.commit()
    done = client.post(f"/bureau/workspace/tasks/{task.id}/complete", headers=auth_headers(office.lawyer_a1))
    assert done.status_code == 200, done.text
    [updated] = audit_rows(db_session, "task.updated")
    assert updated.details == {"fields": ["status"], "transitions": {"task_status": ["pending", "completed"]}}
    assert updated.target_id == task.id and TaskStatus.COMPLETED.value == "completed"
