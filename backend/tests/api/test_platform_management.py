import pytest

from app.models.case import Case, CaseType
from app.models.management import FirmProfile


@pytest.fixture()
def platform(client, office, auth_headers, db_session, monkeypatch):
    office.firm_b.is_platform = True
    office.admin_b.is_platform_admin = True
    db_session.commit()
    monkeypatch.setattr("app.api.routes.platform_management.key_status", lambda firm_id: {"configured": False, "managed": False, "pending": False})
    return {"platform": auth_headers(office.admin_b), "bureau": auth_headers(office.admin_a), "firm": office.firm_a.id, "internal": office.firm_b.id}


def test_profile_operational_metadata_and_platform_only_access(client, platform):
    path = f"/platform/firms/{platform['firm']}/profile"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=platform["bureau"]).status_code == 403
    assert client.get(f"/platform/firms/{platform['internal']}/profile", headers=platform["platform"]).status_code == 404
    response = client.get(path, headers=platform["platform"])
    assert response.status_code == 200, response.text
    assert response.json()["usage"]["active_users"] == 3
    assert "no-store" in response.headers["cache-control"]
    assert len(response.json()["onboarding"]) == 4
    assert "storage_path" not in response.text and "api_key" not in response.text


def test_profile_versions_and_support_history_do_not_expose_customer_records(client, platform, db_session, office):
    path = f"/platform/firms/{platform['firm']}"
    updated = client.put(f"{path}/profile", headers=platform["platform"], json={"contact_name": "Sentetik irtibat", "plan": "professional", "seats": 10, "reason": "Plan yenilendi"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 1
    assert client.put(f"{path}/profile", headers=platform["platform"], json={"version": 0, "reason": "Eski profil"}).status_code == 409
    assert client.get(f"{path}/profile", headers=platform["platform"]).json()["profile"]["contact_name"] == "Sentetik irtibat"
    case = Case(law_firm_id=office.firm_a.id, case_number="CONF", case_name="Özel müşteri dosyası", client_name="Özel müvekkil", case_type=CaseType.DIGER)
    db_session.add(case); db_session.commit()
    customer = client.post("/bureau/records", headers=platform["bureau"], json={"kind": "client", "title": "Gizli müvekkil notu", "status": "active", "data": {"note": "Müşteri sırrı"}})
    assert customer.status_code == 201
    payload = {"kind": "support", "title": "Sentetik destek", "status": "open", "data": {"priority": "high", "note": "Takip edilecek"}}
    support = client.post(f"{path}/support", headers=platform["platform"], json=payload)
    assert support.status_code == 201, support.text
    assert len(client.get(f"{path}/support", headers=platform["platform"]).json()) == 1
    assert client.post(f"{path}/support", headers=platform["platform"], json={**payload, "case_id": case.id}).status_code == 422
    assert client.post(f"{path}/support", headers=platform["platform"], json={"kind": "client", "title": "Yetkisiz", "status": "active", "data": {}}).status_code == 403
    history = client.get(f"{path}/history", headers=platform["platform"])
    assert history.status_code == 200
    assert history.json()["total"] == 2
    assert "Müşteri sırrı" not in history.text and "Gizli müvekkil" not in history.text


def test_seat_limit_blocks_standard_and_scoped_invites(client, platform, office, db_session):
    path = f"/platform/firms/{platform['firm']}/profile"
    assert client.put(path, headers=platform["platform"], json={"seats": 3, "reason": "Sentetik limit"}).status_code == 200
    assert client.post("/admin/users", headers=platform["bureau"], json={"email": "test-limit@example.com", "full_name": "Sentetik Kişi", "role": "lawyer"}).status_code == 409
    assert client.post("/bureau/access/invite", headers=platform["bureau"], json={"email": "scoped-limit@example.com", "full_name": "Sentetik Müvekkil", "position": "client", "case_ids": [], "reason": "Sentetik davet"}).status_code == 409
    from app.models.user import User, UserRole
    inactive = User(law_firm_id=office.firm_a.id, email="inactive-limit@example.com", full_name="Sentetik Pasif", hashed_password="synthetic", role=UserRole.LAWYER, is_active=False)
    db_session.add(inactive);db_session.commit()
    assert client.post(f"/admin/users/{inactive.id}/activate", headers=platform["bureau"]).status_code == 409


def test_status_changes_require_recorded_reason_and_preserve_data(client, platform):
    path = f"/platform/firms/{platform['firm']}"
    assert client.post(f"{path}/suspend", headers=platform["platform"], json={"reason": ""}).status_code == 422
    assert client.post(f"{path}/suspend", headers=platform["platform"], json={"reason": "Sentetik erişim askısı"}).status_code == 200
    assert client.post(f"{path}/activate", headers=platform["platform"], json={"reason": "Sentetik erişim açıldı"}).status_code == 200
    history = client.get(f"{path}/history", headers=platform["platform"]).json()
    assert {r["reason"] for r in history["rows"]} == {"Sentetik erişim askısı", "Sentetik erişim açıldı"}
