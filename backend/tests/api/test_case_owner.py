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
