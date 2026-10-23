"""An archived case is read-only: everything that writes to the case or to its
tasks, documents, timeline and calendar events answers 409 until it is unarchived.
Reading, downloading, the AI analyses and the hand-over report stay available."""
import os
from types import SimpleNamespace

import pytest

ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
HEARING = "2099-03-10"


@pytest.fixture()
def world(client, office, auth_headers, close_case, tmp_path):
    """A lawyer's case with a task, a document and a linked hearing, closed and archived."""
    lawyer = auth_headers(office.lawyer_a1)
    case = client.post(
        "/cases",
        json={"case_number": "2026/1", "case_name": "Arşivlenecek", "client_name": "Müvekkil", "case_type": "kira"},
        headers=lawyer,
    ).json()
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Dilekçe hazırla"}, headers=lawyer).json()
    document = client.post(
        f"/cases/{case['id']}/documents", files={"file": ("not.txt", b"ilk not", "text/plain")}, headers=lawyer
    ).json()
    hearing = client.post(
        "/calendar/events",
        json={"title": "Duruşma", "event_type": "hearing", "starts_at": f"{HEARING}T10:00:00", "case_id": case["id"]},
        headers=lawyer,
    ).json()
    free_event = client.post(
        "/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": "2099-04-01T09:00:00"},
        headers=lawyer,
    ).json()
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == HEARING
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    return SimpleNamespace(
        lawyer=lawyer, admin=auth_headers(office.admin_a), case=case, task=task, document=document,
        hearing=hearing, free_event=free_event,
    )


def _stored_files():
    from app.core.config import settings

    return sorted(name for _, _, names in os.walk(settings.storage_dir) for name in names)


def _conflict(response):
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == ARCHIVED


# --- the case and its timeline --------------------------------------------------------------

def test_case_edits_and_events_are_refused(client, world):
    case_id = world.case["id"]
    for headers in (world.lawyer, world.admin):
        _conflict(client.patch(f"/cases/{case_id}", json={"case_name": "Yeni"}, headers=headers))
        _conflict(client.post(f"/cases/{case_id}/close", json={"outcome": "won", "decision_date": "2026-01-01"}, headers=headers))
        _conflict(client.post(f"/cases/{case_id}/reopen", headers=headers))
        _conflict(client.post(
            f"/cases/{case_id}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=headers
        ))
    detail = client.get(f"/cases/{case_id}", headers=world.lawyer).json()
    assert detail["case_name"] == "Arşivlenecek"
    assert [event["title"] for event in detail["timeline"]] == ["Dava kapatıldı — Kazanıldı"]


# --- tasks -------------------------------------------------------------------------------------

def test_tasks_cannot_be_created_or_changed(client, world):
    case_id, task_id = world.case["id"], world.task["id"]
    _conflict(client.post(f"/cases/{case_id}/tasks", json={"title": "Yeni görev"}, headers=world.lawyer))
    _conflict(client.patch(f"/cases/{case_id}/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer))
    # the firm-wide endpoint used by the calendar and the task list is guarded too
    _conflict(client.patch(f"/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer))
    _conflict(client.patch(f"/tasks/{task_id}", json={"reminder_days": [2]}, headers=world.admin))
    tasks = client.get(f"/cases/{case_id}/tasks", headers=world.lawyer).json()
    assert [(t["title"], t["status"]) for t in tasks] == [("Dilekçe hazırla", "pending")]
    assert [t["id"] for t in client.get("/tasks", headers=world.lawyer).json()] == [task_id]


# --- documents -----------------------------------------------------------------------------------

def test_documents_cannot_be_uploaded_or_deleted_but_can_be_read(client, world):
    case_id, document_id = world.case["id"], world.document["id"]
    stored_before = _stored_files()

    _conflict(client.post(
        f"/cases/{case_id}/documents", files={"file": ("yeni.txt", b"yeni", "text/plain")}, headers=world.lawyer
    ))
    _conflict(client.delete(f"/documents/{document_id}", headers=world.lawyer))

    documents = client.get(f"/cases/{case_id}/documents", headers=world.lawyer).json()
    assert [d["filename"] for d in documents] == ["not.txt"]
    download = client.get(f"/documents/{document_id}/download", headers=world.lawyer)
    assert download.status_code == 200 and download.content == b"ilk not"
    assert _stored_files() == stored_before and len(stored_before) == 1


# --- calendar events linked to the case ---------------------------------------------------------------

def test_calendar_events_of_the_case_are_frozen_and_the_hearing_date_stays(client, world):
    case_id = world.case["id"]
    event_id = world.hearing["id"]

    earlier = {
        "title": "Yeni duruşma", "event_type": "hearing", "starts_at": "2098-01-05T10:00:00", "case_id": case_id,
    }
    _conflict(client.post("/calendar/events", json=earlier, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"starts_at": "2098-01-05T10:00:00"}, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"case_id": None}, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"reminder_days": [5]}, headers=world.admin))
    _conflict(client.delete(f"/calendar/events/{event_id}", headers=world.lawyer))

    assert client.get(f"/calendar/events/{event_id}", headers=world.lawyer).json()["starts_at"] == f"{HEARING}T10:00:00"
    assert client.get(f"/cases/{case_id}", headers=world.lawyer).json()["next_hearing_date"] == HEARING
    items = client.get("/calendar", params={"from": HEARING, "to": HEARING}, headers=world.lawyer).json()
    assert [item["title"] for item in items if item["kind"] == "event"] == ["Duruşma"]


def test_an_event_cannot_be_moved_onto_an_archived_case(client, world):
    free_id = world.free_event["id"]
    _conflict(client.patch(f"/calendar/events/{free_id}", json={"case_id": world.case["id"]}, headers=world.lawyer))
    assert client.get(f"/calendar/events/{free_id}", headers=world.lawyer).json()["case_id"] is None


def test_calendar_events_without_the_case_are_not_affected(client, world):
    free_id = world.free_event["id"]
    created = client.post(
        "/calendar/events", json={"title": "Başka", "event_type": "other", "starts_at": "2099-05-01T09:00:00"},
        headers=world.lawyer,
    )
    assert created.status_code == 201
    assert client.patch(f"/calendar/events/{free_id}", json={"title": "Taşındı"}, headers=world.lawyer).status_code == 200
    assert client.delete(f"/calendar/events/{free_id}", headers=world.lawyer).status_code == 204


# --- what stays open -------------------------------------------------------------------------------------

def test_reading_and_analysis_stay_available(client, world):
    case_id = world.case["id"]
    assert client.get(f"/cases/{case_id}", headers=world.lawyer).status_code == 200
    assert client.post(f"/cases/{case_id}/handover", headers=world.lawyer).status_code == 201
    assert client.post(f"/cases/{case_id}/simulations", headers=world.lawyer).status_code == 202


def test_unarchive_is_allowed_and_restores_every_write(client, world):
    case_id, task_id = world.case["id"], world.task["id"]
    assert client.post(f"/cases/{case_id}/unarchive", headers=world.lawyer).status_code == 200

    assert client.patch(f"/cases/{case_id}", json={"case_name": "Yeni"}, headers=world.lawyer).status_code == 200
    assert client.post(f"/cases/{case_id}/tasks", json={"title": "Yeni görev"}, headers=world.lawyer).status_code == 201
    assert client.patch(f"/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer).status_code == 200
    assert client.post(
        f"/cases/{case_id}/documents", files={"file": ("yeni.txt", b"yeni", "text/plain")}, headers=world.lawyer
    ).status_code == 201
    assert client.post(
        f"/cases/{case_id}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=world.lawyer
    ).status_code == 201
    assert client.delete(f"/calendar/events/{world.hearing['id']}", headers=world.lawyer).status_code == 204
    assert client.post(f"/cases/{case_id}/reopen", headers=world.lawyer).status_code == 200


# --- order of the checks ---------------------------------------------------------------------------------------

def test_another_firm_still_gets_a_404_not_a_409(client, office, auth_headers, world):
    foreign = auth_headers(office.admin_b)
    case_id = world.case["id"]
    assert client.post(f"/cases/{case_id}/tasks", json={"title": "X"}, headers=foreign).status_code == 404
    assert client.patch(f"/tasks/{world.task['id']}", json={"status": "completed"}, headers=foreign).status_code == 404
    assert client.delete(f"/documents/{world.document['id']}", headers=foreign).status_code == 404
    assert client.post(
        f"/cases/{case_id}/documents", files={"file": ("x.txt", b"x", "text/plain")}, headers=foreign
    ).status_code == 404
    assert client.post(
        "/calendar/events", json={"title": "X", "event_type": "other", "starts_at": "2099-05-01T09:00:00", "case_id": case_id},
        headers=foreign,
    ).status_code == 404
    assert client.patch(f"/calendar/events/{world.hearing['id']}", json={"title": "X"}, headers=foreign).status_code == 404


def test_adding_events_tasks_and_documents_stays_open_to_the_whole_firm(client, office, auth_headers):
    owner = auth_headers(office.lawyer_a1)
    colleague = auth_headers(office.lawyer_a2)
    case = client.post(
        "/cases",
        json={"case_number": "2026/9", "case_name": "Açık dava", "client_name": "Müvekkil", "case_type": "kira"},
        headers=owner,
    ).json()

    assert client.post(
        f"/cases/{case['id']}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=colleague
    ).status_code == 201
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Görev"}, headers=colleague)
    assert task.status_code == 201
    assert client.patch(f"/tasks/{task.json()['id']}", json={"status": "completed"}, headers=colleague).status_code == 200
    assert client.post(
        f"/cases/{case['id']}/documents", files={"file": ("a.txt", b"a", "text/plain")}, headers=colleague
    ).status_code == 201
    # ... but changing the case itself stays with the responsible lawyer and the admins
    assert client.patch(f"/cases/{case['id']}", json={"case_name": "X"}, headers=colleague).status_code == 403
