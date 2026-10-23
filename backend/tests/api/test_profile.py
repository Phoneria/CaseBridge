"""PATCH /users/me: a user edits their own name and department only."""


def test_user_updates_own_name_and_department(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    response = client.patch(
        "/users/me", json={"full_name": "  Ayşe   Yılmaz ", "department": " Kira Hukuku "}, headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["department"]) == ("Ayşe Yılmaz", "Kira Hukuku")
    assert client.get("/users/me", headers=headers).json()["full_name"] == "Ayşe Yılmaz"


def test_only_the_sent_fields_change_and_a_null_department_clears_it(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    client.patch("/users/me", json={"department": "İş Hukuku"}, headers=headers)

    only_name = client.patch("/users/me", json={"full_name": "Yeni Ad"}, headers=headers).json()
    assert (only_name["full_name"], only_name["department"]) == ("Yeni Ad", "İş Hukuku")

    cleared = client.patch("/users/me", json={"department": None}, headers=headers).json()
    assert (cleared["full_name"], cleared["department"]) == ("Yeni Ad", None)
    assert client.patch("/users/me", json={"department": "   "}, headers=headers).json()["department"] is None


def test_profile_validation(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    for body in ({"full_name": "   "}, {"full_name": None}, {"full_name": "x" * 256}, {"department": "x" * 101}):
        assert client.patch("/users/me", json=body, headers=headers).status_code == 422, body


def test_role_email_and_active_flag_cannot_be_changed_through_the_profile(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    response = client.patch(
        "/users/me",
        json={"full_name": "Aynı Kişi", "role": "admin", "email": "baska@example.com", "is_active": False},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["role"], body["email"], body["is_active"]) == ("lawyer", office.lawyer_a1.email, True)


def test_profile_requires_login_and_stays_inside_the_own_account(client, db_session, office, auth_headers):
    assert client.patch("/users/me", json={"full_name": "X"}).status_code == 401

    client.patch("/users/me", json={"full_name": "Sadece Ayşe"}, headers=auth_headers(office.lawyer_a1))
    db_session.refresh(office.lawyer_a2)
    assert office.lawyer_a2.full_name == "Mehmet Avukat"
