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


def test_related_precedents_use_selected_case_and_bureau(client, db_session, two_firms_two_users):
    f = two_firms_two_users
    def row(number, category, precedent, firm):
        return Case(case_number=number, case_name=number, case_type=category, client_name="Örnek",
                    is_precedent=precedent, law_firm_id=firm.id)
    case = row("C", CaseType.KIRA, False, f["firm_a"])
    match = row("P", CaseType.KIRA, True, f["firm_a"])
    db_session.add_all([case, match, row("P2", CaseType.ICRA, True, f["firm_a"]),
                        row("P3", CaseType.KIRA, True, f["firm_b"])])
    db_session.commit()
    endpoint = f"/precedents?case_id={case.id}"
    assert [r["id"] for r in client.get(endpoint, headers=_headers(client,f["user_a"],f["password"])).json()] == [match.id]
    assert client.get(endpoint, headers=_headers(client,f["user_b"],f["password"])).status_code == 404


def test_precedent_links_are_specific_writable_and_isolated(client, office, auth_headers, db_session):
    def row(number, category, precedent=False, firm=None):
        return Case(case_name=number, case_number=number, client_name="Taraf", case_type=category,
                    is_precedent=precedent, law_firm_id=firm or office.firm_a.id)
    case = row("C1", CaseType.KIRA)
    other = row("C2", CaseType.KIRA)
    related = row("P", CaseType.ICRA, True)
    foreign = row("F", CaseType.ICRA, True, office.firm_b.id)
    db_session.add_all([case, other, related, foreign])
    db_session.commit()
    headers = auth_headers(office.admin_a)
    path = f"/cases/{case.id}/precedents/"
    assert client.put(path + foreign.id, headers=headers).status_code == 404
    assert client.put(path + related.id, headers=auth_headers(office.lawyer_a1)).status_code == 403
    for _ in range(2):
        assert client.put(path + related.id, headers=headers).status_code == 204
    result = client.get(f"/precedents?case_id={case.id}", headers=headers).json()
    assert [(r["id"], r["linked_to_case"]) for r in result] == [(related.id, True)]
    assert client.get(f"/precedents?case_id={other.id}", headers=headers).json() == []
    assert client.delete(path + related.id, headers=headers).status_code == 204
    assert client.get(f"/precedents?case_id={case.id}", headers=headers).json() == []
    assert client.get(f"/precedents/{related.id}", headers=headers).status_code == 200
