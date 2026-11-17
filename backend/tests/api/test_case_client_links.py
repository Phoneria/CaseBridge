"""Client parties of a case are linked to the firm's clients."""
from app.models.case import CaseParty
from app.models.client import Client

BASE = {"case_number": "2026/701", "case_name": "Alacak Davası", "case_type": "ticaret_hukuku"}


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _party(name, role="plaintiff", is_client=False, client_id=None):
    return {"name": name, "role": role, "is_client": is_client, "client_id": client_id}


def _client_row(db_session, firm, name):
    from app.services.client_names import client_name_key

    row = Client(law_firm_id=firm.id, name=name, name_key=client_name_key(name), client_type="company")
    db_session.add(row)
    db_session.commit()
    return row


def test_a_client_party_without_client_id_creates_then_reuses_a_client(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    first = client.post("/cases", json={**BASE, "parties": [_party("Acme Ltd.", is_client=True), _party("Beta", "defendant")]}, headers=headers)
    assert first.status_code == 201, first.text
    second = client.post("/cases", json={**BASE, "case_number": "2026/702", "parties": [_party("  ACME   ltd. ", is_client=True)]}, headers=headers)
    assert second.status_code == 201, second.text

    clients = db_session.query(Client).all()
    assert [(c.name, c.name_key, c.client_type, c.law_firm_id) for c in clients] == [
        ("Acme Ltd.", "acme ltd.", "person", two_firms_two_users["firm_a"].id)
    ]
    first_parties = first.json()["parties"]
    assert first_parties[0]["client_id"] == clients[0].id
    assert first_parties[1]["client_id"] is None
    assert second.json()["parties"][0]["name"] == "Acme Ltd."
    assert second.json()["client_name"] == "Acme Ltd."


def test_a_chosen_client_gives_its_name_to_the_party(client, db_session, two_firms_two_users):
    chosen = _client_row(db_session, two_firms_two_users["firm_a"], "Yılmaz Tekstil Ltd. Şti.")
    headers = _headers(client, two_firms_two_users)
    response = client.post("/cases", json={**BASE, "parties": [_party("yazım farklı", is_client=True, client_id=chosen.id)]}, headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["parties"][0]["name"] == "Yılmaz Tekstil Ltd. Şti."
    assert body["parties"][0]["client_id"] == chosen.id
    assert body["client_name"] == "Yılmaz Tekstil Ltd. Şti."


def test_another_firms_client_is_refused_and_nothing_is_saved(client, db_session, two_firms_two_users):
    foreign = _client_row(db_session, two_firms_two_users["firm_b"], "Başka Büro Müvekkili")
    headers = _headers(client, two_firms_two_users)
    for client_id in (foreign.id, "missing-id"):
        response = client.post("/cases", json={**BASE, "parties": [_party("X", is_client=True, client_id=client_id)]}, headers=headers)
        assert response.status_code == 422
        assert response.json()["detail"] == "Seçilen müvekkil bulunamadı."
    assert db_session.query(CaseParty).count() == 0


def test_a_non_client_party_never_keeps_a_client_id(client, db_session, two_firms_two_users):
    chosen = _client_row(db_session, two_firms_two_users["firm_a"], "Acme Ltd.")
    headers = _headers(client, two_firms_two_users)
    response = client.post(
        "/cases",
        json={**BASE, "parties": [_party("Biz", is_client=True), _party("Karşı", "defendant", client_id=chosen.id)]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["parties"][1]["client_id"] is None


def test_the_legacy_client_name_create_links_a_client(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    response = client.post("/cases", json={**BASE, "client_name": "Mehmet Demir", "opposing_party": "Ayşe Kaya"}, headers=headers)
    assert response.status_code == 201, response.text
    party = response.json()["parties"][0]
    assert party["is_client"] is True
    assert party["client_id"] == db_session.query(Client).one().id


def test_updating_parties_moves_the_link(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    created = client.post("/cases", json={**BASE, "parties": [_party("Eski Müvekkil", is_client=True)]}, headers=headers).json()
    target = _client_row(db_session, two_firms_two_users["firm_a"], "Yeni Müvekkil")
    response = client.patch(f"/cases/{created['id']}", json={"parties": [_party("x", is_client=True, client_id=target.id)]}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["parties"][0]["client_id"] == target.id
    assert response.json()["client_name"] == "Yeni Müvekkil"


def test_the_case_list_filters_by_client(client, db_session, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    linked = client.post("/cases", json={**BASE, "parties": [_party("Acme Ltd.", is_client=True)]}, headers=headers).json()
    client.post("/cases", json={**BASE, "case_number": "2026/703", "parties": [_party("Başka", is_client=True)]}, headers=headers)
    acme_id = linked["parties"][0]["client_id"]

    listed = client.get(f"/cases?client_id={acme_id}", headers=headers)
    assert listed.status_code == 200
    assert [c["id"] for c in listed.json()] == [linked["id"]]

    other_headers = _headers(client, two_firms_two_users, "user_b")
    assert client.get(f"/cases?client_id={acme_id}", headers=other_headers).json() == []
