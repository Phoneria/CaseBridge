"""The responsible lawyer's name on case responses, the "none" (unassigned) list filter,
and the admin assignment route's archived guard and Turkish messages."""
from datetime import timedelta

from sqlalchemy import event

from app.core.timeutil import local_today
from app.models.case import Case, CaseType

OPENED = (local_today() - timedelta(days=30)).isoformat()


def _new_case(client, headers, number, **extra):
    response = client.post("/cases", json={
        "case_number": number, "case_name": f"Dava {number}", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED, **extra,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _unassigned_case(db_session, office, number="2026/U1"):
    case = Case(law_firm_id=office.firm_a.id, case_number=number, case_name="Sahipsiz Dava", client_name="Müvekkil",
                case_type=CaseType.KIRA, opening_date=local_today())
    db_session.add(case)
    db_session.commit()
    return case


def test_case_responses_carry_the_responsible_lawyers_name(client, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    created = _new_case(client, lawyer, "2026/O1")
    assert created["assigned_lawyer_name"] == "Ayşe Avukat"
    assert client.get(f"/cases/{created['id']}", headers=lawyer).json()["assigned_lawyer_name"] == "Ayşe Avukat"
    listed = client.get("/cases", headers=lawyer).json()
    assert [(c["id"], c["assigned_lawyer_name"]) for c in listed] == [(created["id"], "Ayşe Avukat")]


def test_an_unassigned_case_has_no_name_and_the_none_filter_finds_it(client, db_session, office, auth_headers):
    admin = auth_headers(office.admin_a)
    lawyer = auth_headers(office.lawyer_a1)
    _new_case(client, lawyer, "2026/O2")
    orphan = _unassigned_case(db_session, office)

    listed = client.get("/cases", params={"assigned_lawyer_id": "none"}, headers=admin).json()

    assert [(c["id"], c["assigned_lawyer_name"]) for c in listed] == [(orphan.id, None)]


def test_listing_many_cases_does_not_query_once_per_case(client, db_session, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    colleague = auth_headers(office.lawyer_a2)
    for index in range(6):
        _new_case(client, lawyer if index % 2 else colleague, f"2026/Q{index}")

    statements = []
    engine = db_session.get_bind()
    listener = lambda conn, cursor, statement, *args: statements.append(statement)  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        response = client.get("/cases", headers=lawyer)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert response.status_code == 200 and len(response.json()) == 6
    user_selects = [s for s in statements if "FROM users" in s]
    # One for the signed-in user (auth), one batched load of the responsible lawyers; a few more for parties etc. is fine.
    assert len(user_selects) <= 3, user_selects


def test_admin_assignment_returns_the_new_name(client, office, auth_headers):
    admin = auth_headers(office.admin_a)
    case = _new_case(client, auth_headers(office.lawyer_a1), "2026/O3")
    response = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    assert response.status_code == 200
    assert (response.json()["assigned_lawyer_id"], response.json()["assigned_lawyer_name"]) == (office.lawyer_a2.id, "Mehmet Avukat")


def test_admin_assignment_answers_in_turkish(client, office, auth_headers):
    admin = auth_headers(office.admin_a)
    case = _new_case(client, auth_headers(office.lawyer_a1), "2026/O4")
    missing = client.patch("/admin/cases/no-such-case/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    wrong = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_b.id}, headers=admin)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Dava bulunamadı.")
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Bu büroda aktif bir avukat seçin.")


def test_admin_assignment_refuses_an_archived_case(client, office, auth_headers, close_case):
    admin = auth_headers(office.admin_a)
    lawyer = auth_headers(office.lawyer_a1)
    case = _new_case(client, lawyer, "2026/O5")
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    response = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    assert (response.status_code, response.json()["detail"]) == (409, "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.")


# ----- reassignment: upcoming hearings (and their reminders) follow the case -----


def _hearing_event(client, headers, case_id, day, assignee_id=None, time_part="10:00:00"):
    payload = {"title": "Duruşma", "event_type": "hearing", "case_id": case_id,
               "starts_at": f"{day.isoformat()}T{time_part}"}
    if assignee_id is not None:
        payload["assignee_id"] = assignee_id
    response = client.post("/calendar/events", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _reassign(client, office, auth_headers, case_id, lawyer):
    response = client.patch(f"/admin/cases/{case_id}/lawyer", json={"assigned_lawyer_id": lawyer.id},
                            headers=auth_headers(office.admin_a))
    assert response.status_code == 200, response.text


def _assignee(db_session, event_id):
    from app.models.calendar import CalendarEvent

    db_session.expire_all()
    return db_session.get(CalendarEvent, event_id).assignee_id


def test_reassigning_moves_upcoming_hearings_of_the_previous_lawyer_or_nobody(client, db_session, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    case = _new_case(client, lawyer, "2026/R1")
    today = local_today()
    own = _hearing_event(client, lawyer, case["id"], today + timedelta(days=5), office.lawyer_a1.id)
    unassigned = _hearing_event(client, lawyer, case["id"], today + timedelta(days=6))
    third = _hearing_event(client, lawyer, case["id"], today + timedelta(days=7), office.admin_a.id)
    past = _hearing_event(client, lawyer, case["id"], today - timedelta(days=5), office.lawyer_a1.id)
    timed_today = _hearing_event(client, lawyer, case["id"], today, office.lawyer_a1.id, "00:05:00")

    _reassign(client, office, auth_headers, case["id"], office.lawyer_a2)

    b = office.lawyer_a2.id
    assert _assignee(db_session, own) == b
    assert _assignee(db_session, unassigned) == b
    assert _assignee(db_session, timed_today) == b
    assert _assignee(db_session, third) == office.admin_a.id
    assert _assignee(db_session, past) == office.lawyer_a1.id


def test_reassigning_makes_the_due_hearing_reminder_go_to_the_new_lawyer(client, db_session, office, auth_headers):
    from datetime import datetime, time

    from app.services.reminder_service import ReminderService

    lawyer = auth_headers(office.lawyer_a1)
    day = local_today() + timedelta(days=3)
    case = client.post("/cases", json={
        "case_number": "2026/R2", "case_name": "R2", "client_name": "Müvekkil", "case_type": "sozlesme",
        "next_hearing_date": day.isoformat(),
    }, headers=lawyer).json()

    _reassign(client, office, auth_headers, case["id"], office.lawyer_a2)

    db_session.expire_all()
    due = ReminderService(db_session).collect_due(datetime.combine(local_today(), time(12, 0)))
    assert [d.recipient_id for d in due] == [office.lawyer_a2.id]
