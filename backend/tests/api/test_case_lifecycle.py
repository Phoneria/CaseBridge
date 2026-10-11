"""POST /cases/{id}/close, /reopen, /archive and /unarchive: rules, timeline events,
permissions (responsible lawyer or admin), firm isolation and the effect on analytics."""
from datetime import date

import pytest

from app.models.case import Case, CaseEvent, CaseStatus, CaseType

NOT_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
TODAY = date(2026, 10, 11)


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    """The routes take "today" from the application time zone; pin it."""
    monkeypatch.setattr("app.api.routes.cases.local_today", lambda: TODAY)


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {"case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira", **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _close_payload(**overrides):
    return {"outcome": "won", "decision_date": "2026-10-01", **overrides}


def _timeline(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["timeline"]


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


# --- close -----------------------------------------------------------------------------

@pytest.mark.parametrize("outcome, label", [("won", "Kazanıldı"), ("lost", "Kaybedildi"), ("settled", "Sulh")])
def test_close_writes_the_decision_and_a_timeline_event(client, db_session, office, lawyer, outcome, label):
    case = _new_case(client, lawyer)

    response = client.post(
        f"/cases/{case['id']}/close",
        json=_close_payload(outcome=outcome, note="Karar tebliğ edildi."),
        headers=lawyer,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["outcome"]) == ("kapali", outcome)
    assert (body["decision_date"], body["closing_note"]) == ("2026-10-01", "Karar tebliğ edildi.")
    assert body["is_archived"] is False
    timeline = _timeline(client, lawyer, case["id"])
    assert [(e["event_date"], e["title"], e["description"], e["event_type"]) for e in timeline] == [
        ("2026-10-01", f"Dava kapatıldı — {label}", "Karar tebliğ edildi.", "other"),
    ]
    event = db_session.query(CaseEvent).filter(CaseEvent.case_id == case["id"]).one()
    assert event.created_by == office.lawyer_a1.id and event.law_firm_id == office.firm_a.id


def test_close_trims_the_note_and_treats_a_blank_note_as_none(client, lawyer):
    first = _new_case(client, lawyer, "2026/1")
    second = _new_case(client, lawyer, "2026/2")
    third = _new_case(client, lawyer, "2026/3")

    trimmed = client.post(f"/cases/{first['id']}/close", json=_close_payload(note="  Not  \n"), headers=lawyer).json()
    blank = client.post(f"/cases/{second['id']}/close", json=_close_payload(note="   "), headers=lawyer).json()
    omitted = client.post(f"/cases/{third['id']}/close", json=_close_payload(), headers=lawyer).json()

    assert trimmed["closing_note"] == "Not"
    assert blank["closing_note"] is None and omitted["closing_note"] is None
    assert _timeline(client, lawyer, second["id"])[0]["description"] is None


def test_close_accepts_a_4000_character_note_and_rejects_a_longer_one(client, lawyer):
    case = _new_case(client, lawyer)

    too_long = client.post(f"/cases/{case['id']}/close", json=_close_payload(note="a" * 4001), headers=lawyer)
    assert too_long.status_code == 422
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"

    ok = client.post(f"/cases/{case['id']}/close", json=_close_payload(note=" " + "a" * 4000 + " "), headers=lawyer)
    assert ok.status_code == 200 and len(ok.json()["closing_note"]) == 4000


@pytest.mark.parametrize("outcome", ["ongoing", "other", "", None])
def test_close_requires_one_of_the_three_outcomes(client, lawyer, outcome):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(outcome=outcome), headers=lawyer)
    assert response.status_code == 422


def test_close_requires_a_decision_date(client, lawyer):
    case = _new_case(client, lawyer)
    assert client.post(f"/cases/{case['id']}/close", json={"outcome": "won"}, headers=lawyer).status_code == 422
    bad = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="yarın"), headers=lawyer)
    assert bad.status_code == 422


def test_close_rejects_a_decision_date_after_today_but_accepts_today(client, db_session, lawyer):
    case = _new_case(client, lawyer)

    future = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-12"), headers=lawyer)
    assert future.status_code == 422
    assert future.json()["detail"] == "Karar tarihi ileri bir tarih olamaz."
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"
    assert db_session.query(CaseEvent).filter(CaseEvent.case_id == case["id"]).count() == 0

    today = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-11"), headers=lawyer)
    assert today.status_code == 200 and today.json()["decision_date"] == "2026-10-11"


def test_today_is_the_application_local_date(client, lawyer, monkeypatch):
    """The route compares with local_today() (APP_TIMEZONE), not with the UTC date."""
    case = _new_case(client, lawyer)
    monkeypatch.setattr("app.api.routes.cases.local_today", lambda: date(2026, 10, 13))

    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-13"), headers=lawyer)

    assert response.status_code == 200


def test_closing_a_closed_case_is_a_409_and_changes_nothing(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"], outcome="won", decision_date="2026-10-01")

    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(outcome="lost"), headers=lawyer)

    assert response.status_code == 409
    assert response.json()["detail"] == "Dava zaten kapalı."
    detail = client.get(f"/cases/{case['id']}", headers=lawyer).json()
    assert detail["outcome"] == "won" and len(detail["timeline"]) == 1


# --- reopen ----------------------------------------------------------------------------

def test_reopen_clears_the_decision_and_adds_an_event_dated_today(client, lawyer, close_case):
    case = _new_case(client, lawyer, status="karar_bekleyen")
    close_case(lawyer, case["id"], outcome="lost", decision_date="2026-10-01", note="Ret")

    response = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["outcome"]) == ("devam_eden", "ongoing")
    assert (body["decision_date"], body["closing_note"]) == (None, None)
    timeline = _timeline(client, lawyer, case["id"])
    assert [(e["event_date"], e["title"], e["description"], e["event_type"]) for e in timeline] == [
        ("2026-10-01", "Dava kapatıldı — Kaybedildi", "Ret", "other"),
        ("2026-10-11", "Dava yeniden açıldı", None, "other"),
    ]


def test_reopening_an_open_case_is_a_409(client, lawyer):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)
    assert response.status_code == 409
    assert response.json()["detail"] == "Dava zaten açık."
    assert _timeline(client, lawyer, case["id"]) == []


def test_a_reopened_case_can_be_closed_again(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/reopen", headers=lawyer)

    again = close_case(lawyer, case["id"], outcome="settled", decision_date="2026-10-05")

    assert (again["outcome"], again["decision_date"]) == ("settled", "2026-10-05")
    assert len(_timeline(client, lawyer, case["id"])) == 3


# --- archive / unarchive ---------------------------------------------------------------

def test_only_a_closed_case_can_be_archived(client, lawyer, close_case):
    case = _new_case(client, lawyer)

    refused = client.post(f"/cases/{case['id']}/archive", headers=lawyer)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Yalnızca kapalı davalar arşivlenebilir."

    close_case(lawyer, case["id"])
    archived = client.post(f"/cases/{case['id']}/archive", headers=lawyer)
    assert archived.status_code == 200 and archived.json()["is_archived"] is True


def test_archiving_twice_returns_the_case_unchanged(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    first = client.post(f"/cases/{case['id']}/archive", headers=lawyer).json()

    second = client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    assert second.status_code == 200
    assert second.json() == first


def test_an_archived_case_that_is_still_open_is_returned_unchanged_too(client, db_session, office, lawyer):
    """Cases archived before closing was required stay archived; archiving them again is not an error."""
    case = _new_case(client, lawyer)
    row = db_session.get(Case, case["id"])
    row.is_archived = True
    db_session.commit()

    response = client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    assert response.status_code == 200 and response.json()["is_archived"] is True


def test_unarchive_is_idempotent_and_keeps_the_case_closed(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    first = client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)
    second = client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)

    assert first.status_code == second.status_code == 200
    assert first.json()["is_archived"] is False and second.json() == first.json()
    assert first.json()["status"] == "kapali"
    assert client.get("/cases", headers=lawyer).json()[0]["id"] == case["id"]


def test_an_archived_case_cannot_be_closed_or_reopened(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    reopen = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)
    close = client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=lawyer)

    assert (reopen.status_code, reopen.json()["detail"]) == (409, ARCHIVED)
    assert (close.status_code, close.json()["detail"]) == (409, ARCHIVED)
    assert client.post(f"/cases/{case['id']}/unarchive", headers=lawyer).status_code == 200
    assert client.post(f"/cases/{case['id']}/reopen", headers=lawyer).status_code == 200


# --- who may do it -----------------------------------------------------------------------

def _actions(case_id):
    return [
        ("close", f"/cases/{case_id}/close", _close_payload()),
        ("reopen", f"/cases/{case_id}/reopen", None),
        ("archive", f"/cases/{case_id}/archive", None),
        ("unarchive", f"/cases/{case_id}/unarchive", None),
    ]


def test_another_lawyer_of_the_firm_gets_a_403_on_every_action(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    other = auth_headers(office.lawyer_a2)

    for name, path, body in _actions(case["id"]):
        response = client.post(path, headers=other, **({"json": body} if body else {}))
        assert (response.status_code, response.json()["detail"]) == (403, NOT_MANAGER), name


def test_an_admin_can_close_reopen_archive_and_unarchive_any_case_of_the_firm(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    admin = auth_headers(office.admin_a)

    assert client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/archive", headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/unarchive", headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/reopen", headers=admin).status_code == 200


def test_a_case_without_a_responsible_lawyer_is_only_managed_by_an_admin(client, db_session, office, auth_headers, lawyer):
    orphan = Case(
        law_firm_id=office.firm_a.id, case_number="2026/77", case_name="Sahipsiz", client_name="M",
        case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN, assigned_lawyer_id=None,
    )
    db_session.add(orphan)
    db_session.commit()

    for name, path, body in _actions(orphan.id):
        response = client.post(path, headers=lawyer, **({"json": body} if body else {}))
        assert (response.status_code, response.json()["detail"]) == (403, NOT_MANAGER), name
    closed = client.post(f"/cases/{orphan.id}/close", json=_close_payload(), headers=auth_headers(office.admin_a))
    assert closed.status_code == 200


def test_another_firm_gets_a_404_on_every_action_even_as_admin(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    foreign_admin = auth_headers(office.admin_b)

    for name, path, body in _actions(case["id"]):
        response = client.post(path, headers=foreign_admin, **({"json": body} if body else {}))
        assert response.status_code == 404, name
    assert client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=lawyer).status_code == 200


def test_the_actions_need_a_login(client, office, lawyer):
    case = _new_case(client, lawyer)
    for name, path, body in _actions(case["id"]):
        assert client.post(path, **({"json": body} if body else {})).status_code == 401, name


def test_permission_is_checked_before_the_case_state(client, office, auth_headers, lawyer):
    """A stranger learns nothing about the case: 403 even when the state would be a 409."""
    case = _new_case(client, lawyer)
    other = auth_headers(office.lawyer_a2)
    assert client.post(f"/cases/{case['id']}/reopen", headers=other).status_code == 403
    assert client.post(f"/cases/{case['id']}/archive", headers=other).status_code == 403


# --- effect on the numbers -----------------------------------------------------------------

def test_closing_cases_moves_the_analytics_counts(client, office, auth_headers, lawyer, close_case):
    won = _new_case(client, lawyer, "2026/1")
    lost = _new_case(client, lawyer, "2026/2")
    settled = _new_case(client, lawyer, "2026/3")
    _new_case(client, lawyer, "2026/4")
    admin = auth_headers(office.admin_a)

    before = client.get("/analytics/overview", headers=admin).json()
    assert (before["active_cases"], before["won_cases"], before["lost_cases"], before["win_rate"]) == (4, 0, 0, 0.0)

    close_case(lawyer, won["id"], "won")
    close_case(lawyer, lost["id"], "lost")
    close_case(lawyer, settled["id"], "settled")
    after = client.get("/analytics/overview", headers=admin).json()

    assert (after["total_cases"], after["active_cases"]) == (4, 1)
    assert (after["won_cases"], after["lost_cases"], after["win_rate"]) == (1, 1, 50.0)
    mine = next(row for row in after["by_lawyer"] if row["lawyer_id"] == office.lawyer_a1.id)
    assert (mine["won"], mine["lost"], mine["active"]) == (1, 1, 1)

    client.post(f"/cases/{won['id']}/reopen", headers=lawyer)
    reopened = client.get("/analytics/overview", headers=admin).json()
    assert (reopened["active_cases"], reopened["won_cases"]) == (2, 0)
