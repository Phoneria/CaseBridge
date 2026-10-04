"""Public decisions are not the firm's client cases or outcomes."""
from app.models.case import Case, CaseOutcome, CaseStatus, CaseType
from app.models.document import Document, DocumentType


def _headers(client, user, password):
    token = client.post("/auth/login", json={"email": user.email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_precedents_are_separate_and_tenant_scoped(client, db_session, two_firms_two_users):
    fixture = two_firms_two_users
    precedent = Case(
        law_firm_id=fixture["firm_a"].id, case_number="Y9HD 2026/1 E. 2026/2 K.",
        case_name="Emsal İş Kararı", client_name="Davacı (anonim)",
        case_type=CaseType.IS_HUKUKU, status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON, assigned_lawyer_id=fixture["user_a"].id,
        is_precedent=True,
    )
    firm_case = Case(
        law_firm_id=fixture["firm_a"].id, case_number="2026/1",
        case_name="Büro Davası", client_name="Gerçek Müvekkil",
        case_type=CaseType.IS_HUKUKU, assigned_lawyer_id=fixture["user_a"].id,
    )
    db_session.add_all([precedent, firm_case])
    db_session.flush()
    db_session.add(Document(
        case_id=precedent.id, law_firm_id=fixture["firm_a"].id,
        filename="karar.txt", file_type=DocumentType.TXT,
        storage_path="demo://precedent/karar.txt", extracted_text="Kararın tam metni",
    ))
    db_session.commit()

    headers_a = _headers(client, fixture["user_a"], fixture["password"])
    headers_b = _headers(client, fixture["user_b"], fixture["password"])
    assert [row["id"] for row in client.get("/cases", headers=headers_a).json()] == [firm_case.id]
    overview = client.get("/analytics/overview", headers=headers_a).json()
    assert overview["total_cases"] == 1
    assert overview["won_cases"] == 0
    assert overview["by_lawyer"][0]["total"] == 1
    assert [row["id"] for row in client.get("/precedents", headers=headers_a).json()] == [precedent.id]
    assert client.get(f"/cases/{precedent.id}", headers=headers_a).status_code == 404
    assert client.get(f"/precedents/{precedent.id}", headers=headers_b).status_code == 404
    documents = client.get(f"/precedents/{precedent.id}/documents", headers=headers_a).json()
    assert [row["filename"] for row in documents] == ["karar.txt"]
    assert client.get(f"/precedents/{precedent.id}/documents", headers=headers_b).status_code == 404
