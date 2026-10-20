"""GET /cases/{id}/hearings and POST /calendar/events/{id}/result: the hearing list of a
case and the note written after a hearing (timeline entry, next hearing, closed and
archived cases, firm isolation)."""
from datetime import timedelta

import pytest

from app.core.timeutil import local_today
from app.models.case import CaseEvent

TODAY = local_today()
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
CLOSED = "Kapalı davaya duruşma eklenemez."
NOT_A_CASE_HEARING = "Sonuç yalnızca davaya bağlı duruşmalara girilebilir."
NOT_YET = "Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir."
OPENED = (TODAY - timedelta(days=60)).isoformat()


def day(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    for route in ("calendar", "cases"):
        monkeypatch.setattr(f"app.api.routes.{route}.local_today", lambda: TODAY)


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


@pytest.fixture()
def case(client, lawyer):
    return _new_case(client, lawyer)


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {
        "case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED, **overrides,
    }
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _hearing(client, headers, case_id, starts_at, **extra):
    payload = {"title": "Duruşma", "event_type": "hearing", "starts_at": starts_at, "case_id": case_id, **extra}
    response = client.post("/calendar/events", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _result(client, headers, event_id, note="Bilirkişi raporu beklenecek.", **extra):
    return client.post(f"/calendar/events/{event_id}/result", json={"result_note": note, **extra}, headers=headers)


def _timeline(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["timeline"]


# --- GET /cases/{id}/hearings -----------------------------------------------------------------

def test_the_hearings_of_a_case_are_listed_earliest_first_with_their_flags(client, lawyer, case):
    later = _hearing(client, lawyer, case["id"], f"{day(9)}T14:30:00", location="3. Asliye Hukuk", notes="Tanık dinlenecek")
    past = _hearing(client, lawyer, case["id"], f"{day(-4)}T10:00:00", duration_minutes=90)
    today = _hearing(client, lawyer, case["id"], f"{day(0)}T00:00:00", all_day=True)
    client.post("/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": f"{day(1)}T09:00:00", "case_id": case["id"]}, headers=lawyer)
    other = _new_case(client, lawyer, number="2026/2")
    _hearing(client, lawyer, other["id"], f"{day(3)}T10:00:00")

    response = client.get(f"/cases/{case['id']}/hearings", headers=lawyer)

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [past["id"], today["id"], later["id"]]
    assert body[0] == {
        "id": past["id"], "starts_at": f"{day(-4)}T10:00:00", "all_day": False, "duration_minutes": 90,
        "location": None, "notes": None, "assignee_id": None, "result_note": None,
        "is_past": True, "result_open": True,
    }
    assert (body[1]["is_past"], body[1]["result_open"], body[1]["all_day"]) == (False, True, True)
    assert (body[2]["is_past"], body[2]["result_open"]) == (False, False)
    assert (body[2]["location"], body[2]["notes"]) == ("3. Asliye Hukuk", "Tanık dinlenecek")


def test_a_case_without_hearings_has_an_empty_list(client, lawyer, case):
    assert client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json() == []


def test_the_hearing_list_of_another_firm_is_a_404_and_needs_a_login(client, case, office, auth_headers):
    outsider = auth_headers(office.lawyer_b)
    response = client.get(f"/cases/{case['id']}/hearings", headers=outsider)
    assert response.status_code == 404
    assert client.get(f"/cases/{case['id']}/hearings").status_code == 401


def test_any_lawyer_of_the_firm_may_read_the_hearings(client, case, office, auth_headers, lawyer):
    _hearing(client, lawyer, case["id"], f"{day(3)}T10:00:00")
    colleague = auth_headers(office.lawyer_a2)
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=colleague).json()) == 1


# --- POST /calendar/events/{id}/result --------------------------------------------------------

def test_a_result_is_stored_with_a_timeline_entry_dated_on_the_hearing(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")

    response = _result(client, lawyer, hearing["id"], note="  Bilirkişi raporu beklenecek.  ")

    assert response.status_code == 200
    body = response.json()
    assert body["next_hearing"] is None
    assert (body["hearing"]["id"], body["hearing"]["result_note"], body["hearing"]["is_past"]) == (
        hearing["id"], "Bilirkişi raporu beklenecek.", True,
    )
    [entry] = _timeline(client, lawyer, case["id"])
    assert (entry["event_date"], entry["event_type"], entry["description"]) == (
        day(-3), "hearing", "Bilirkişi raporu beklenecek.",
    )
    shown = (TODAY - timedelta(days=3)).strftime("%d.%m.%Y")
    assert entry["title"] == f"Duruşma yapıldı — {shown}"
    stored = client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()
    assert stored["result_note"] == "Bilirkişi raporu beklenecek."
    item = next(i for i in client.get("/calendar", params={"from": day(-5), "to": day(-1)}, headers=lawyer).json() if i["event_id"] == hearing["id"])
    assert item["result_note"] == "Bilirkişi raporu beklenecek."


def test_entering_the_result_again_updates_the_same_timeline_entry(client, lawyer, case, db_session):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")
    _result(client, lawyer, hearing["id"], note="İlk not")

    second = _result(client, lawyer, hearing["id"], note="Düzeltilmiş not")

    assert second.status_code == 200
    [entry] = _timeline(client, lawyer, case["id"])
    assert entry["description"] == "Düzeltilmiş not"
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] == "Düzeltilmiş not"


def test_a_deleted_timeline_entry_is_written_again(client, lawyer, case, db_session):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")
    _result(client, lawyer, hearing["id"], note="İlk not")
    for row in db_session.query(CaseEvent).all():
        db_session.delete(row)
    db_session.commit()

    assert _result(client, lawyer, hearing["id"], note="Yeni not").status_code == 200

    [entry] = _timeline(client, lawyer, case["id"])
    assert entry["description"] == "Yeni not"


def test_a_hearing_that_is_today_takes_a_result(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(0)}T23:30:00")
    assert _result(client, lawyer, hearing["id"]).status_code == 200


def test_the_result_can_add_the_next_hearing_in_the_same_request(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")

    response = _result(
        client, lawyer, hearing["id"],
        next_hearing={"starts_at": f"{day(20)}T11:15:00", "duration_minutes": 45, "location": "5. Asliye Hukuk", "notes": "Karar"},
    )

    assert response.status_code == 200
    following = response.json()["next_hearing"]
    assert (following["starts_at"], following["duration_minutes"], following["location"], following["notes"]) == (
        f"{day(20)}T11:15:00", 45, "5. Asliye Hukuk", "Karar",
    )
    assert (following["is_past"], following["result_note"], following["assignee_id"]) == (False, None, case["assigned_lawyer_id"])
    stored = client.get(f"/calendar/events/{following['id']}", headers=lawyer).json()
    assert (stored["title"], stored["event_type"], stored["case_id"], stored["reminder_days"]) == ("Duruşma", "hearing", case["id"], [3, 1])
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == day(20)
    assert [h["id"] for h in client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()] == [hearing["id"], following["id"]]


def test_an_all_day_next_hearing_is_stored_at_midnight(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    following = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(7)}T15:00:00", "all_day": True}).json()["next_hearing"]
    assert (following["starts_at"], following["all_day"]) == (f"{day(7)}T00:00:00", True)


@pytest.mark.parametrize("note", ["", "   ", "x" * 4001])
def test_a_blank_or_too_long_note_is_rejected(client, lawyer, case, note):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    assert _result(client, lawyer, hearing["id"], note=note).status_code == 422
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] is None


def test_the_longest_note_is_accepted(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    assert _result(client, lawyer, hearing["id"], note="x" * 4000).status_code == 200


def test_only_hearings_linked_to_a_case_take_a_result(client, lawyer, case):
    meeting = client.post("/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": f"{day(-1)}T09:00:00", "case_id": case["id"]}, headers=lawyer).json()
    unlinked = client.post("/calendar/events", json={"title": "Duruşma", "event_type": "hearing", "starts_at": f"{day(-1)}T09:00:00"}, headers=lawyer).json()
    for event in (meeting, unlinked):
        response = _result(client, lawyer, event["id"])
        assert (response.status_code, response.json()["detail"]) == (422, NOT_A_CASE_HEARING)


def test_a_hearing_that_has_not_happened_yet_takes_no_result(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(1)}T00:30:00")
    response = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(30)}T10:00:00"})
    assert (response.status_code, response.json()["detail"]) == (422, NOT_YET)
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()) == 1
    assert _timeline(client, lawyer, case["id"]) == []


def test_an_archived_case_refuses_the_result(client, lawyer, case, close_case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200

    response = _result(client, lawyer, hearing["id"])

    assert (response.status_code, response.json()["detail"]) == (409, ARCHIVED)
    assert _timeline(client, lawyer, case["id"])[0]["title"].startswith("Dava kapatıldı")
    assert len(_timeline(client, lawyer, case["id"])) == 1


def test_a_closed_case_takes_the_note_but_not_a_next_hearing(client, lawyer, case, close_case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    close_case(lawyer, case["id"])

    refused = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(10)}T10:00:00"})
    assert (refused.status_code, refused.json()["detail"]) == (409, CLOSED)
    # Nothing was written: not even the note.
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] is None
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()) == 1

    accepted = _result(client, lawyer, hearing["id"], note="Karar tebliği bekleniyor")
    assert accepted.status_code == 200
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] == "Karar tebliği bekleniyor"


def test_a_result_of_another_firm_is_a_404(client, lawyer, case, office, auth_headers):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    response = _result(client, auth_headers(office.lawyer_b), hearing["id"])
    assert (response.status_code, response.json()["detail"]) == (404, "Etkinlik bulunamadı")
    assert client.post("/calendar/events/x/result", json={"result_note": "a"}).status_code == 401


def test_deleting_the_hearing_keeps_its_timeline_entry(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    _result(client, lawyer, hearing["id"])

    assert client.delete(f"/calendar/events/{hearing['id']}", headers=lawyer).status_code == 204

    assert len(_timeline(client, lawyer, case["id"])) == 1
    assert client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json() == []


def test_the_result_does_not_move_a_cached_date_to_the_past(client, lawyer, case):
    _hearing(client, lawyer, case["id"], f"{day(5)}T10:00:00")
    past = _hearing(client, lawyer, case["id"], f"{day(-5)}T10:00:00")
    _result(client, lawyer, past["id"])
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == day(5)
