"""Case lifecycle actions leave one metadata-only audit row each; failures leave none."""
from tests.api.audit_helpers import audit_rows

BASE = {"case_number": "2026/901", "case_name": "Gizli Dava Adı", "case_type": "kira"}
PARTIES = [
    {"name": "Gizli Müvekkil", "role": "plaintiff", "is_client": True},
    {"name": "Karşı Taraf", "role": "defendant", "is_client": False},
]


def _create(client, headers, **extra):
    response = client.post("/cases", json={**BASE, "parties": PARTIES, **extra}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_records_source_and_party_counts(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers, source="ai_intake")
    [row] = audit_rows(db_session, "case.created")
    assert (row.case_id, row.case_type, row.actor_user_id) == (case["id"], "kira", office.lawyer_a1.id)
    assert row.details == {"counts": {"clients": 1, "parties": 2}, "flags": {"source": "ai_intake"}}
    _create(client, headers, case_number="2026/902")
    assert audit_rows(db_session, "case.created")[1].details["flags"] == {"source": "form"}


def test_a_failed_create_records_nothing(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    _create(client, headers)
    assert client.post("/cases", json={**BASE, "parties": PARTIES}, headers=headers).status_code == 409
    assert len(audit_rows(db_session, "case.created")) == 1


def test_update_records_changed_fields_and_transitions_only(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    response = client.patch(f"/cases/{case['id']}", json={"description": "yeni gizli açıklama", "court": case.get("court")},
                            headers=headers)
    assert response.status_code == 200, response.text
    [row] = audit_rows(db_session, "case.updated")
    assert row.details == {"fields": ["description"]}

    client.patch(f"/cases/{case['id']}", json={"case_type": "icra"}, headers=headers)
    row = audit_rows(db_session, "case.updated")[-1]
    assert row.details == {"fields": ["case_type"], "transitions": {"case_type": ["kira", "icra"]}}
    assert row.case_type == "icra"


def test_an_update_that_changes_nothing_records_nothing(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    client.patch(f"/cases/{case['id']}", json={"case_type": "kira"}, headers=headers)
    assert audit_rows(db_session, "case.updated") == []


def test_a_client_role_change_is_a_transition(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    response = client.patch(f"/cases/{case['id']}", json={"parties": PARTIES, "client_role": "defendant"}, headers=headers)
    assert response.status_code == 200, response.text
    [row] = audit_rows(db_session, "case.updated")
    assert row.details == {"fields": ["client_role"], "transitions": {"client_role": ["plaintiff", "defendant"]}}


def test_party_changes_are_their_own_action(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    client.patch(f"/cases/{case['id']}", json={"parties": [*PARTIES, {"name": "Üçüncü", "role": "other"}]}, headers=headers)
    [row] = audit_rows(db_session, "case.parties_changed")
    assert row.details == {"counts": {"clients": 1, "parties": 3}}
    assert audit_rows(db_session, "case.updated") == []


def test_close_reopen_archive_unarchive(client, db_session, office, auth_headers, close_case):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    close_case(headers, case["id"], outcome="settled")
    closed = audit_rows(db_session, "case.closed")[0]
    assert closed.details["transitions"] == {"outcome": ["ongoing", "settled"]}
    assert isinstance(closed.details["counts"]["open_days"], int)
    assert client.post(f"/cases/{case['id']}/reopen", headers=headers).status_code == 200
    close_case(headers, case["id"], outcome="settled")  # only a closed case can be archived
    assert client.post(f"/cases/{case['id']}/archive", headers=headers).status_code == 200
    assert client.post(f"/cases/{case['id']}/unarchive", headers=headers).status_code == 200
    for action in ("case.reopened", "case.archived", "case.unarchived"):
        [row] = audit_rows(db_session, action)
        assert row.case_id == case["id"] and row.details == {}


def test_admin_lawyer_change_records_both_ids(client, db_session, office, auth_headers):
    case = _create(client, auth_headers(office.lawyer_a1))
    response = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id},
                            headers=auth_headers(office.admin_a))
    assert response.status_code == 200, response.text
    [row] = audit_rows(db_session, "case.lawyer_changed")
    assert row.actor_role == "admin"
    assert row.details == {"transitions": {"assigned_lawyer_id": [office.lawyer_a1.id, office.lawyer_a2.id]}}


def test_handover_is_recorded(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    case = _create(client, headers)
    assert client.post(f"/cases/{case['id']}/handover", headers=headers).status_code == 201
    [row] = audit_rows(db_session, "case.handover_created")
    assert row.case_id == case["id"] and row.actor_user_id == office.lawyer_a1.id
