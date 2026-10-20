"""Notes (Notlar) and typed timeline entries: POST /cases/{id}/events with the
Turkish input rules, the author's name, and (Task 2) PATCH/DELETE of notes."""
from datetime import timedelta

import pytest

from app.core.timeutil import local_today

TODAY = local_today()
OPENED = (TODAY - timedelta(days=30)).isoformat()
DAY = (TODAY - timedelta(days=3)).isoformat()


def _new_case(client, headers, number="2026/N1"):
    response = client.post("/cases", json={
        "case_number": number, "case_name": "Kira Alacağı", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _add_note(client, headers, case_id, text="Müvekkil aradı.\nDetaylar yarın.", event_date=DAY):
    response = client.post(f"/cases/{case_id}/events", json={
        "event_date": event_date, "event_type": "note", "description": text,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


def test_a_note_is_saved_with_a_derived_title_and_its_author(client, office, lawyer):
    case = _new_case(client, lawyer)

    note = _add_note(client, lawyer, case["id"])

    assert (note["event_type"], note["title"], note["description"]) == ("note", "Müvekkil aradı.", "Müvekkil aradı.\nDetaylar yarın.")
    assert (note["created_by"], note["created_by_name"]) == (office.lawyer_a1.id, "Ayşe Avukat")
    timeline = client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"]
    assert [(e["id"], e["created_by_name"]) for e in timeline] == [(note["id"], "Ayşe Avukat")]


@pytest.mark.parametrize("payload, detail", [
    ({"event_type": "note", "description": "   "}, "Not metni boş olamaz."),
    ({"event_type": "note"}, "Not metni boş olamaz."),
    ({"event_type": "note", "description": "x" * 4001}, "Not en fazla 4000 karakter olabilir."),
    ({"event_type": "other", "title": " "}, "Gelişme başlığı boş olamaz."),
    ({"event_type": "filing"}, "Gelişme başlığı boş olamaz."),
    ({"title": "x" * 256}, "Gelişme başlığı en fazla 255 karakter olabilir."),
    ({"title": "Rapor", "description": "x" * 4001}, "Açıklama en fazla 4000 karakter olabilir."),
])
def test_invalid_entries_answer_422_with_a_turkish_sentence(client, lawyer, payload, detail):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, **payload}, headers=lawyer)
    assert response.status_code == 422
    assert response.json()["detail"] == detail


def test_a_typed_entry_keeps_its_type_and_trimmed_description(client, lawyer):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/events", json={
        "event_date": DAY, "title": " Bilirkişi raporu tebliğ edildi ", "description": "  ", "event_type": "expert_report",
    }, headers=lawyer)
    assert response.status_code == 201
    body = response.json()
    assert (body["title"], body["description"], body["event_type"]) == ("Bilirkişi raporu tebliğ edildi", None, "expert_report")


def test_an_entry_without_an_author_has_no_name(client, db_session, lawyer):
    from app.models.case import CaseEvent, CaseEventType

    case = _new_case(client, lawyer)
    db_session.add(CaseEvent(case_id=case["id"], law_firm_id=case["law_firm_id"], event_date=TODAY, title="İçe aktarılan",
                             event_type=CaseEventType.OTHER))
    db_session.commit()
    timeline = client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"]
    assert (timeline[0]["created_by"], timeline[0]["created_by_name"]) == (None, None)


def test_archived_case_refuses_a_note_before_checking_it(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    response = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, "event_type": "note", "description": ""}, headers=lawyer)
    assert response.status_code == 409
