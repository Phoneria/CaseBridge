import csv
import io
import json
import logging
from datetime import date, datetime, timedelta

from app.models.audit import AuditEvent
from tests.api.test_platform_firms import platform  # noqa: F401 - pytest fixture

COLUMNS = ["occurred_at", "firm_id", "firm_name", "actor_user_id", "actor_role", "action", "case_id", "case_type",
           "target_type", "target_id", "details"]


def _row(db_session, firm, when, action="case.reopened", **extra):
    db_session.add(AuditEvent(law_firm_id=firm.id, action=action, occurred_at=when, details=extra.pop("details", {}),
                              **extra))
    db_session.commit()


def _csv(response):
    assert response.status_code == 200, response.text
    assert response.content.startswith("﻿".encode("utf-8"))
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))


def test_only_platform_admins_can_export(client, office, auth_headers):
    assert client.get("/platform/audit-events.csv", headers=auth_headers(office.admin_a)).status_code == 403


def test_export_lists_rows_in_range_in_order_without_the_platform_firm(client, db_session, office, platform, caplog):
    today = date.today()
    _row(db_session, office.firm_a, datetime.combine(today, datetime.min.time()) + timedelta(hours=9),
         action="case.closed", actor_user_id=office.lawyer_a1.id, actor_role="lawyer", case_type="kira",
         details={"counts": {"open_days": 3}})
    _row(db_session, office.firm_b, datetime.combine(today, datetime.min.time()) + timedelta(hours=8))
    _row(db_session, platform.firm, datetime.combine(today, datetime.min.time()) + timedelta(hours=7))
    _row(db_session, office.firm_a, datetime.combine(today - timedelta(days=40), datetime.min.time()))

    with caplog.at_level(logging.INFO, logger="casebridge"):
        rows = _csv(client.get("/platform/audit-events.csv", headers=platform.headers))
    assert rows[0] == COLUMNS
    assert [(r[1], r[5]) for r in rows[1:]] == [(office.firm_b.id, "case.reopened"), (office.firm_a.id, "case.closed")]
    closed = rows[2]
    assert closed[0].endswith("T09:00:00Z") and closed[2] == "Demir Hukuk"
    assert (closed[3], closed[4], closed[7]) == (office.lawyer_a1.id, "lawyer", "kira")
    assert json.loads(closed[10]) == {"counts": {"open_days": 3}}
    assert "Hareket kaydı dışa aktarıldı" in caplog.text and "Demir Hukuk" not in caplog.text


def test_firm_filter_and_inclusive_dates(client, db_session, office, platform):
    day = date(2026, 3, 10)
    _row(db_session, office.firm_a, datetime(2026, 3, 10, 0, 0, 0))
    _row(db_session, office.firm_a, datetime(2026, 3, 10, 23, 59, 59))
    _row(db_session, office.firm_a, datetime(2026, 3, 11, 0, 0, 0))
    _row(db_session, office.firm_b, datetime(2026, 3, 10, 12, 0, 0))
    response = client.get("/platform/audit-events.csv", headers=platform.headers,
                          params={"firm_id": office.firm_a.id, "from": day.isoformat(), "to": day.isoformat()})
    assert len(_csv(response)) == 3
    assert response.headers["content-disposition"] == 'attachment; filename="casebridge-hareketler-2026-03-10-2026-03-10.csv"'


def test_range_rules(client, office, platform):
    headers = platform.headers
    reversed_range = client.get("/platform/audit-events.csv", headers=headers, params={"from": "2026-03-10", "to": "2026-03-01"})
    assert reversed_range.status_code == 422
    assert reversed_range.json()["detail"] == "Başlangıç tarihi bitiş tarihinden sonra olamaz."
    too_long = client.get("/platform/audit-events.csv", headers=headers, params={"from": "2025-01-01", "to": "2026-01-02"})
    assert too_long.status_code == 422
    assert too_long.json()["detail"] == "En fazla 366 günlük kayıt indirilebilir."
    assert client.get("/platform/audit-events.csv", headers=headers,
                      params={"from": "2025-01-01", "to": "2026-01-01"}).status_code == 200
    assert client.get("/platform/audit-events.csv", headers=headers, params={"firm_id": "missing"}).status_code == 404
