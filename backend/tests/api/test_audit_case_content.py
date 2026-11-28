"""Actions inside a case leave one metadata-only row each."""
from datetime import date, timedelta

from tests.api.audit_helpers import audit_rows

BASE = {"case_number": "2026/950", "case_name": "Gizli Dava Adı", "case_type": "kira",
        "parties": [{"name": "Gizli Müvekkil", "role": "plaintiff", "is_client": True}]}


def _case(client, headers):
    response = client.post("/cases", json=BASE, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_note_create_update_delete(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _case(client, headers)
    today = date.today().isoformat()
    note = client.post(f"/cases/{case['id']}/events", json={"title": "Gizli not", "event_type": "note",
                                                           "description": "gizli metin", "event_date": today},
                       headers=headers)
    assert note.status_code == 201, note.text
    note_id = note.json()["id"]
    [created] = audit_rows(db_session, "case_event.created")
    assert (created.target_type, created.target_id) == ("event", note_id)
    assert created.details == {"transitions": {"event_type": [None, "note"]}}

    client.patch(f"/cases/{case['id']}/events/{note_id}", json={"description": "yeni gizli metin"}, headers=headers)
    [updated] = audit_rows(db_session, "case_event.updated")
    assert updated.details == {"fields": ["description"]}

    client.delete(f"/cases/{case['id']}/events/{note_id}", headers=headers)
    [deleted] = audit_rows(db_session, "case_event.deleted")
    assert deleted.target_id == note_id and deleted.details == {"transitions": {"event_type": ["note", None]}}


def test_document_upload_and_delete(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _case(client, headers)
    upload = client.post(f"/cases/{case['id']}/documents", headers=headers,
                         files={"file": ("gizli-dilekce.txt", "Gizli dilekçe metni " * 200, "text/plain")})
    assert upload.status_code == 201, upload.text
    [uploaded] = audit_rows(db_session, "document.uploaded")
    assert uploaded.target_type == "document"
    assert uploaded.details["flags"] == {"file_kind": "txt", "text_extracted": "yes"}
    assert uploaded.details["counts"]["size_kb"] >= 1
    assert client.delete(f"/documents/{upload.json()['id']}", headers=headers).status_code == 204
    [deleted] = audit_rows(db_session, "document.deleted")
    assert deleted.case_id == case["id"] and deleted.details["flags"]["file_kind"] == "txt"


def test_task_create_and_status_change(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gizli görev"}, headers=headers)
    assert task.status_code == 201, task.text
    [created] = audit_rows(db_session, "task.created")
    assert created.details == {"transitions": {"task_status": [None, "pending"]}}
    client.patch(f"/tasks/{task.json()['id']}", json={"status": "completed"}, headers=headers)
    [updated] = audit_rows(db_session, "task.updated")
    assert updated.actor_user_id == office.lawyer_a1.id
    assert updated.details == {"fields": ["status"], "transitions": {"task_status": ["pending", "completed"]}}


def test_calendar_event_and_hearing_result(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _case(client, headers)
    starts = (date.today() - timedelta(days=1)).isoformat() + "T10:00:00"
    event = client.post("/calendar/events", headers=headers, json={
        "title": "Gizli duruşma", "event_type": "hearing", "starts_at": starts, "case_id": case["id"],
    })
    assert event.status_code == 201, event.text
    [created] = audit_rows(db_session, "calendar_event.created")
    assert created.case_id == case["id"]
    assert created.details == {"flags": {"linked_to_case": "yes"}, "transitions": {"event_type": [None, "hearing"]}}
    result = client.post(f"/calendar/events/{event.json()['id']}/result", headers=headers,
                         json={"result_note": "Gizli sonuç notu"})
    assert result.status_code == 200, result.text
    [recorded] = audit_rows(db_session, "hearing.result_recorded")
    assert recorded.details == {"flags": {"linked_to_case": "yes"}}
    client.patch(f"/calendar/events/{event.json()['id']}", json={"location": "Adliye"}, headers=headers)
    assert audit_rows(db_session, "calendar_event.updated")[0].details["fields"] == ["location"]
    meeting = client.post("/calendar/events", headers=headers, json={
        "title": "Toplantı", "event_type": "meeting", "starts_at": starts,
    }).json()
    assert client.delete(f"/calendar/events/{meeting['id']}", headers=headers).status_code == 204
    [deleted] = audit_rows(db_session, "calendar_event.deleted")
    assert deleted.case_id is None and deleted.details["flags"] == {"linked_to_case": "no"}


def test_client_actions(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    created = client.post("/clients", json={"name": "Gizli Şirket", "client_type": "company"}, headers=headers).json()
    client.patch(f"/clients/{created['id']}", json={"phone": "0212"}, headers=headers)
    client.delete(f"/clients/{created['id']}", headers=headers)
    rows = audit_rows(db_session)
    assert [(r.action, r.target_id) for r in rows] == [
        ("client.created", created["id"]), ("client.updated", created["id"]), ("client.deleted", created["id"]),
    ]
    assert rows[0].details == {"flags": {"client_type": "company"}}
    assert rows[1].details == {"fields": ["phone"], "flags": {"client_type": "company"}}
