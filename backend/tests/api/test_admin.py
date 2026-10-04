from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.case import Case, CaseStatus, CaseType


def _headers(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_admin_can_assign_only_active_lawyers_in_own_firm(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    admin = User(
        law_firm_id=data["firm_a"].id, email="admin.a@demo.casebridge.dev",
        hashed_password=hash_password("password123"), full_name="Yönetici",
        role=UserRole.ADMIN, is_active=True,
    )
    colleague = User(
        law_firm_id=data["firm_a"].id, email="colleague@demo.casebridge.dev",
        hashed_password=hash_password("password123"), full_name="Zeynep Arslan",
        department="Kira Hukuku", role=UserRole.LAWYER, is_active=True,
    )
    db_session.add_all([admin, colleague])
    db_session.commit()
    admin_headers = _headers(client, admin.email, "password123")
    lawyer_headers = _headers(client, data["user_a"].email, data["password"])

    assert client.post("/cases", json={
        "case_number": "2026/900", "case_name": "Atamasız Dava",
        "client_name": "Müvekkil", "case_type": "kira",
    }, headers=admin_headers).status_code == 422

    created = client.post("/cases", json={
        "case_number": "2026/901", "case_name": "Test Dava",
        "client_name": "Müvekkil", "case_type": "kira",
    }, headers=lawyer_headers)
    assert created.status_code == 201
    case = created.json()
    assert case["assigned_lawyer_id"] == data["user_a"].id

    path = f"/admin/cases/{case['id']}/lawyer"
    assert client.patch(path, json={"assigned_lawyer_id": colleague.id}, headers=lawyer_headers).status_code == 403
    assert client.patch(path, json={"assigned_lawyer_id": data["user_b"].id}, headers=admin_headers).status_code == 422
    assert client.patch(path, json={"assigned_lawyer_id": admin.id}, headers=admin_headers).status_code == 422
    changed = client.patch(path, json={"assigned_lawyer_id": colleague.id}, headers=admin_headers)
    assert changed.status_code == 200
    assert changed.json()["assigned_lawyer_id"] == colleague.id

    overview = client.get("/analytics/overview", headers=admin_headers).json()
    assert {row["full_name"]: row["total"] for row in overview["by_lawyer"]} == {
        data["user_a"].full_name: 0, colleague.full_name: 1,
    }
    assert client.get("/admin/lawyers", headers=lawyer_headers).status_code == 403
    assert {row["id"] for row in client.get("/admin/lawyers", headers=admin_headers).json()} == {
        data["user_a"].id, colleague.id,
    }


def test_create_case_rejects_foreign_lawyer(client, two_firms_two_users):
    data = two_firms_two_users
    headers = _headers(client, data["user_a"].email, data["password"])
    response = client.post("/cases", json={
        "case_number": "2026/902", "case_name": "Test Dava", "client_name": "Müvekkil",
        "case_type": "kira", "assigned_lawyer_id": data["user_b"].id,
    }, headers=headers)
    assert response.status_code == 403


def test_admin_assigns_precedent_reviewer_without_changing_firm_case_metrics(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    admin = User(
        law_firm_id=data["firm_a"].id, email="admin.review@demo.casebridge.dev",
        hashed_password=hash_password("password123"), full_name="Yönetici",
        role=UserRole.ADMIN, is_active=True,
    )
    colleague = User(
        law_firm_id=data["firm_a"].id, email="reviewer@demo.casebridge.dev",
        hashed_password=hash_password("password123"), full_name="Kerem Demir",
        role=UserRole.LAWYER, is_active=True,
    )
    inactive = User(
        law_firm_id=data["firm_a"].id, email="inactive@demo.casebridge.dev",
        hashed_password=hash_password("password123"), full_name="Pasif Avukat",
        role=UserRole.LAWYER, is_active=False,
    )
    precedent = Case(
        law_firm_id=data["firm_a"].id, case_number="Y9HD 2026/1 E.",
        case_name="Emsal Karar", client_name="Davacı (anonim)",
        case_type=CaseType.IS_HUKUKU, status=CaseStatus.KAPALI,
        is_precedent=True,
    )
    foreign_precedent = Case(
        law_firm_id=data["firm_b"].id, case_number="Y9HD 2026/2 E.",
        case_name="Diğer Büro Emsali", client_name="Davacı (anonim)",
        case_type=CaseType.IS_HUKUKU, is_precedent=True,
    )
    firm_case = Case(
        law_firm_id=data["firm_a"].id, case_number="2026/3",
        case_name="Büro Davası", client_name="Müvekkil",
        case_type=CaseType.IS_HUKUKU, assigned_lawyer_id=data["user_a"].id,
    )
    db_session.add_all([admin, colleague, inactive, precedent, foreign_precedent, firm_case])
    db_session.commit()
    admin_headers = _headers(client, admin.email, "password123")
    lawyer_headers = _headers(client, data["user_a"].email, data["password"])
    path = f"/admin/precedents/{precedent.id}/reviewer"
    payload = {"reviewer_lawyer_id": colleague.id}

    assert client.patch(path, json=payload, headers=lawyer_headers).status_code == 403
    assert client.patch(path, json={"reviewer_lawyer_id": data["user_b"].id}, headers=admin_headers).status_code == 422
    assert client.patch(path, json={"reviewer_lawyer_id": inactive.id}, headers=admin_headers).status_code == 422
    assert client.patch(path, json={"reviewer_lawyer_id": admin.id}, headers=admin_headers).status_code == 422
    assert client.patch(f"/admin/precedents/{foreign_precedent.id}/reviewer", json=payload, headers=admin_headers).status_code == 404
    assert client.patch(f"/admin/precedents/{firm_case.id}/reviewer", json=payload, headers=admin_headers).status_code == 404

    response = client.patch(path, json=payload, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["reviewer_lawyer_id"] == colleague.id
    assert response.json()["assigned_lawyer_id"] is None
    assert client.get("/precedents", headers=admin_headers).json()[0]["reviewer_lawyer_id"] == colleague.id
    overview = client.get("/analytics/overview", headers=admin_headers).json()
    assert overview["total_cases"] == 1
    assert next(row for row in overview["by_lawyer"] if row["lawyer_id"] == data["user_a"].id)["total"] == 1
    assert next(row for row in overview["by_lawyer"] if row["lawyer_id"] == colleague.id)["total"] == 0
