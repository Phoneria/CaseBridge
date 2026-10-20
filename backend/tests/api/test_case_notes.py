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


# --- PATCH / DELETE notes ------------------------------------------------------------

def _patch(client, headers, case_id, event_id, **body):
    return client.patch(f"/cases/{case_id}/events/{event_id}", json=body, headers=headers)


def _delete(client, headers, case_id, event_id):
    return client.delete(f"/cases/{case_id}/events/{event_id}", headers=headers)


def test_the_author_edits_a_note_and_the_title_follows_the_text(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    new_day = (TODAY - timedelta(days=1)).isoformat()

    response = _patch(client, lawyer, case["id"], note["id"], description="  Yeni ilk satır\nsonra ", event_date=new_day)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["title"], body["description"], body["event_date"]) == ("Yeni ilk satır", "Yeni ilk satır\nsonra", new_day)
    assert body["created_by_name"] == "Ayşe Avukat"


def test_a_patch_with_only_a_date_keeps_the_text(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    response = _patch(client, lawyer, case["id"], note["id"], event_date=TODAY.isoformat())
    assert response.status_code == 200
    assert response.json()["description"] == note["description"]


def test_an_empty_text_is_refused(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    response = _patch(client, lawyer, case["id"], note["id"], description=" ")
    assert (response.status_code, response.json()["detail"]) == (422, "Not metni boş olamaz.")


def test_the_author_deletes_a_note(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    assert _delete(client, lawyer, case["id"], note["id"]).status_code == 204
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"] == []


def test_responsible_lawyer_and_admin_may_change_a_colleagues_note(client, office, auth_headers, lawyer):
    colleague = auth_headers(office.lawyer_a2)
    admin = auth_headers(office.admin_a)
    case = _new_case(client, lawyer)  # lawyer_a1 is responsible
    note = _add_note(client, colleague, case["id"], text="Meslektaş notu")

    assert _patch(client, lawyer, case["id"], note["id"], description="Sorumlu düzeltti").status_code == 200
    assert _patch(client, admin, case["id"], note["id"], description="Yönetici düzeltti").status_code == 200
    assert _delete(client, admin, case["id"], note["id"]).status_code == 204


def test_another_lawyer_may_not_change_a_note(client, office, auth_headers, lawyer):
    colleague = auth_headers(office.lawyer_a2)
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    detail = "Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir."

    patched = _patch(client, colleague, case["id"], note["id"], description="Değiştirme denemesi")
    deleted = _delete(client, colleague, case["id"], note["id"])

    assert (patched.status_code, patched.json()["detail"]) == (403, detail)
    assert (deleted.status_code, deleted.json()["detail"]) == (403, detail)


def test_only_notes_can_be_changed(client, lawyer):
    case = _new_case(client, lawyer)
    entry = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, "title": "Dava açıldı", "event_type": "filing"},
                        headers=lawyer).json()
    detail = "Yalnızca notlar düzenlenebilir veya silinebilir."
    patched = _patch(client, lawyer, case["id"], entry["id"], description="x")
    deleted = _delete(client, lawyer, case["id"], entry["id"])
    assert (patched.status_code, patched.json()["detail"]) == (409, detail)
    assert (deleted.status_code, deleted.json()["detail"]) == (409, detail)


def test_unknown_or_foreign_entries_are_404(client, office, auth_headers, lawyer):
    other_firm = auth_headers(office.admin_b)
    case = _new_case(client, lawyer)
    other_case = _new_case(client, lawyer, number="2026/N2")
    note = _add_note(client, lawyer, case["id"])

    for response in (
        _patch(client, lawyer, case["id"], "no-such-id", description="x"),
        _patch(client, lawyer, other_case["id"], note["id"], description="x"),  # entry of another case
        _patch(client, other_firm, case["id"], note["id"], description="x"),  # another firm
        _delete(client, other_firm, case["id"], note["id"]),
    ):
        assert (response.status_code, response.json()["detail"]) == (404, "Kayıt bulunamadı.")


def test_archived_case_notes_are_read_only(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    archived = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
    patched = _patch(client, lawyer, case["id"], note["id"], description="x")
    deleted = _delete(client, lawyer, case["id"], note["id"])
    assert (patched.status_code, patched.json()["detail"]) == (409, archived)
    assert (deleted.status_code, deleted.json()["detail"]) == (409, archived)
