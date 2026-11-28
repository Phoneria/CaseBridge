"""Platform admins browse one firm's audit events as JSON, newest first."""
import logging
from datetime import date, datetime, timedelta

from app.models.audit import AuditEvent
from tests.api.test_platform_firms import platform  # noqa: F401 - pytest fixture

TODAY = date.today()


def _at(hours: int, days_ago: int = 0) -> datetime:
    return datetime.combine(TODAY - timedelta(days=days_ago), datetime.min.time()) + timedelta(hours=hours)


def _row(db_session, firm, when, action="case.reopened", **extra):
    row = AuditEvent(law_firm_id=firm.id, action=action, occurred_at=when, details=extra.pop("details", {}), **extra)
    db_session.add(row)
    db_session.commit()
    return row


def _path(firm):
    return f"/platform/firms/{firm.id}/audit-events"


def test_only_platform_admins_and_customer_firms(client, office, platform, auth_headers):
    assert client.get(_path(office.firm_a)).status_code == 401
    assert client.get(_path(office.firm_a), headers=auth_headers(office.admin_a)).status_code == 403
    assert client.get("/platform/firms/missing/audit-events", headers=platform.headers).status_code == 404
    assert client.get(_path(platform.firm), headers=platform.headers).status_code == 404


def test_lists_one_firm_newest_first_with_summary(client, db_session, office, platform, caplog):
    closed = _row(db_session, office.firm_a, _at(9), action="case.closed", actor_user_id=office.lawyer_a1.id,
                  actor_role="lawyer", case_id="case-1", case_type="kira",
                  details={"counts": {"open_days": 3}, "transitions": {"outcome": ["ongoing", "won"]}})
    _row(db_session, office.firm_a, _at(8))
    _row(db_session, office.firm_a, _at(7))
    _row(db_session, office.firm_b, _at(10))
    _row(db_session, office.firm_a, _at(9, days_ago=40))

    with caplog.at_level(logging.INFO, logger="casebridge"):
        response = client.get(_path(office.firm_a), headers=platform.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["firm_id"], body["firm_name"]) == (office.firm_a.id, "Demir Hukuk")
    assert (body["from"], body["to"]) == ((TODAY - timedelta(days=29)).isoformat(), TODAY.isoformat())
    assert body["total"] == 3 and body["by_action"] == {"case.closed": 1, "case.reopened": 2}
    first = body["items"][0]
    assert first == {
        "id": closed.id, "occurred_at": _at(9).strftime("%Y-%m-%dT%H:%M:%SZ"), "actor_user_id": office.lawyer_a1.id,
        "actor_role": "lawyer", "action": "case.closed", "case_id": "case-1", "case_type": "kira",
        "target_type": None, "target_id": None,
        "details": {"counts": {"open_days": 3}, "transitions": {"outcome": ["ongoing", "won"]}},
    }
    assert [i["occurred_at"][11:13] for i in body["items"]] == ["09", "08", "07"]
    assert "Hareket kayıtları görüntülendi" in caplog.text and "Demir Hukuk" not in caplog.text


def test_filters_and_paging(client, db_session, office, platform):
    for hour in range(5):
        _row(db_session, office.firm_a, _at(hour), action="task.created", case_id="case-1",
             actor_user_id=office.lawyer_a1.id)
    _row(db_session, office.firm_a, _at(6), action="task.created", case_id="case-2", actor_user_id=office.lawyer_a2.id)
    _row(db_session, office.firm_a, _at(7), action="document.uploaded", case_id="case-1",
         actor_user_id=office.lawyer_a1.id)
    get = lambda **params: client.get(_path(office.firm_a), headers=platform.headers, params=params).json()

    assert get(action="task.created")["total"] == 6
    assert get(case_id="case-1")["by_action"] == {"document.uploaded": 1, "task.created": 5}
    assert get(actor_user_id=office.lawyer_a2.id)["total"] == 1
    page = get(action="task.created", case_id="case-1", limit=2, offset=2)
    assert page["total"] == 5 and [i["occurred_at"][11:13] for i in page["items"]] == ["02", "01"]
    assert (page["limit"], page["offset"]) == (2, 2)


def test_rejects_bad_parameters(client, office, platform):
    get = lambda **params: client.get(_path(office.firm_a), headers=platform.headers, params=params)
    assert get(action="case.anything").status_code == 422
    assert get(limit=0).status_code == 422 and get(limit=201).status_code == 422 and get(offset=-1).status_code == 422
    reversed_range = get(**{"from": "2026-03-10", "to": "2026-03-01"})
    assert reversed_range.status_code == 422
    assert reversed_range.json()["detail"] == "Başlangıç tarihi bitiş tarihinden sonra olamaz."
    assert get(**{"from": "2026-03-01", "to": "2026-03-10"}).json()["total"] == 0


def test_shows_no_content(client, office, auth_headers, platform):
    headers = auth_headers(office.lawyer_a1)
    case = client.post("/cases", headers=headers, json={
        "case_number": "V/1", "case_name": "GİZLİ-DAVA", "case_type": "kira",
        "parties": [{"name": "GİZLİ-MÜVEKKİL", "role": "plaintiff", "is_client": True}]}).json()
    client.patch(f"/cases/{case['id']}", headers=headers, json={"description": "GİZLİ-NOT"})
    response = client.get(_path(office.firm_a), headers=platform.headers)
    assert response.json()["total"] == 2
    for secret in ["GİZLİ-DAVA", "GİZLİ-MÜVEKKİL", "GİZLİ-NOT", office.lawyer_a1.email, office.lawyer_a1.full_name]:
        assert secret not in response.text
