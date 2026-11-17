"""The /clients API: firm-scoped CRUD, search, counts, stats, rename and delete rules."""
from datetime import date

from app.models.case import Case, CaseOutcome, CaseParty, CaseStatus, CaseType
from app.models.client import Client


def _create(client, headers, **fields):
    response = client.post("/clients", json={"name": "Acme Ltd.", **fields}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _case(db_session, firm, client_id, number, name, **fields):
    case = Case(law_firm_id=firm.id, case_number=number, case_name="Dava " + number, client_name=name,
                case_type=CaseType.KIRA, **fields)
    case.parties = [CaseParty(law_firm_id=firm.id, name=name, role="plaintiff", is_client=True, client_id=client_id, sort_order=0)]
    db_session.add(case)
    db_session.commit()
    return case


def test_create_trims_blanks_and_returns_the_client(client, office, auth_headers):
    body = _create(client, auth_headers(office.lawyer_a1), name="  Nova  Yazılım A.Ş. ", client_type="company",
                   phone=" 0212 555 10 20 ", email="  ", address="", notes="Önemli müvekkil")
    assert body["name"] == "Nova Yazılım A.Ş."
    assert body["client_type"] == "company"
    assert body["phone"] == "0212 555 10 20"
    assert body["email"] is None and body["address"] is None
    assert body["notes"] == "Önemli müvekkil"
    assert body["law_firm_id"] == office.firm_a.id


def test_create_rejects_a_blank_name_and_a_bad_email(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    assert client.post("/clients", json={"name": "   "}, headers=headers).status_code == 422
    assert client.post("/clients", json={"name": "A", "email": "yanlis"}, headers=headers).status_code == 422
    assert client.post("/clients", json={"name": "A", "client_type": "robot"}, headers=headers).status_code == 422


def test_list_searches_name_phone_and_email_within_the_firm_only(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    _create(client, headers, name="IŞIK Hukuk Danışmanlık")
    _create(client, headers, name="Beta", phone="0532 111 22 33")
    _create(client, headers, name="Gama", email="gama@example.com")
    _create(client, auth_headers(office.lawyer_b), name="Işık Başka Büro")

    names = lambda q: [c["name"] for c in client.get("/clients", params={"q": q}, headers=headers).json()]
    assert names("ışık") == ["IŞIK Hukuk Danışmanlık"]
    assert names("111 22") == ["Beta"]
    assert names("GAMA@") == ["Gama"]
    assert [c["name"] for c in client.get("/clients", headers=headers).json()] == ["Beta", "Gama", "IŞIK Hukuk Danışmanlık"]
    assert [c["name"] for c in client.get("/clients", params={"limit": 1, "offset": 1}, headers=headers).json()] == ["Gama"]


def test_list_counts_cases_and_open_cases_without_precedents(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    acme = _create(client, headers)
    _case(db_session, office.firm_a, acme["id"], "1", "Acme Ltd.")
    _case(db_session, office.firm_a, acme["id"], "2", "Acme Ltd.", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON)
    _case(db_session, office.firm_a, acme["id"], "3", "Acme Ltd.", is_archived=True)
    _case(db_session, office.firm_a, acme["id"], "4", "Acme Ltd.", is_precedent=True)
    row = client.get("/clients", headers=headers).json()[0]
    assert (row["case_count"], row["open_case_count"]) == (3, 1)


def test_detail_has_stats_and_cases_open_first_then_by_hearing(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    acme = _create(client, headers)
    _case(db_session, office.firm_a, acme["id"], "late", "Acme Ltd.", next_hearing_date=date(2026, 12, 20), case_value=1000)
    _case(db_session, office.firm_a, acme["id"], "soon", "Acme Ltd.", next_hearing_date=date(2026, 12, 1), case_value=500)
    _case(db_session, office.firm_a, acme["id"], "none", "Acme Ltd.")
    _case(db_session, office.firm_a, acme["id"], "won", "Acme Ltd.", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON, case_value=250)
    _case(db_session, office.firm_a, acme["id"], "lost", "Acme Ltd.", status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST, is_archived=True)
    _case(db_session, office.firm_a, acme["id"], "settled", "Acme Ltd.", status=CaseStatus.KAPALI, outcome=CaseOutcome.SETTLED)

    body = client.get(f"/clients/{acme['id']}", headers=headers).json()
    assert body["name"] == "Acme Ltd."
    assert body["stats"] == {"total": 6, "open": 3, "closed": 3, "archived": 1, "won": 1, "lost": 1,
                             "settled": 1, "total_case_value": 1750.0}
    assert [c["case_number"] for c in body["cases"]][:3] == ["soon", "late", "none"]
    assert set(c["case_number"] for c in body["cases"][3:]) == {"won", "lost", "settled"}
    assert set(body["cases"][0]) == {"id", "case_number", "case_name", "case_type", "status", "outcome",
                                     "assigned_lawyer_name", "next_hearing_date", "is_archived"}


def test_another_firms_client_is_a_404_everywhere(client, office, auth_headers):
    foreign = _create(client, auth_headers(office.lawyer_b))
    headers = auth_headers(office.admin_a)
    assert client.get(f"/clients/{foreign['id']}", headers=headers).status_code == 404
    assert client.patch(f"/clients/{foreign['id']}", json={"name": "X"}, headers=headers).status_code == 404
    response = client.delete(f"/clients/{foreign['id']}", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Müvekkil bulunamadı."


def test_rename_rewrites_party_names_and_client_name_even_on_archived_cases(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    acme = _create(client, headers)
    case = _case(db_session, office.firm_a, acme["id"], "1", "Acme Ltd.", is_archived=True)
    db_session.add(CaseParty(case_id=case.id, law_firm_id=office.firm_a.id, name="Diğer Müvekkil", role="plaintiff",
                             is_client=True, client_id=None, sort_order=1))
    db_session.commit()

    response = client.patch(f"/clients/{acme['id']}", json={"name": "ACME Holding", "phone": "0212"}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "ACME Holding"
    db_session.expire_all()
    assert db_session.get(Client, acme["id"]).name_key == "acme holding"
    linked = db_session.query(CaseParty).filter(CaseParty.client_id == acme["id"]).one()
    assert linked.name == "ACME Holding"
    assert db_session.get(Case, case.id).client_name == "ACME Holding, Diğer Müvekkil"


def test_patch_rejects_a_null_name(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    acme = _create(client, headers)
    assert client.patch(f"/clients/{acme['id']}", json={"name": None}, headers=headers).status_code == 422


def test_only_an_admin_deletes_and_only_a_client_without_cases(client, db_session, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    admin = auth_headers(office.admin_a)
    acme = _create(client, lawyer)
    free = _create(client, lawyer, name="Davasız Müvekkil")
    _case(db_session, office.firm_a, acme["id"], "1", "Acme Ltd.")

    forbidden = client.delete(f"/clients/{free['id']}", headers=lawyer)
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Müvekkili yalnızca yönetici silebilir."
    conflict = client.delete(f"/clients/{acme['id']}", headers=admin)
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Bu müvekkilin davaları var; silinemez."
    assert client.delete(f"/clients/{free['id']}", headers=admin).status_code == 204
    assert client.get(f"/clients/{free['id']}", headers=admin).status_code == 404
