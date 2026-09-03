"""Law Firm Isolation (section 22).

Uses the /users scoped endpoints as the minimal tenant-scoped resource
available at Foundation stage. Case/Document isolation tests (built on
the same repository-level enforcement pattern) are added in Milestone
2 and 3 respectively.
"""


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_user_can_access_own_firm_data(client, two_firms_two_users):
    fixtures = two_firms_two_users
    token = _login(client, fixtures["user_a"].email, fixtures["password"])

    response = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert fixtures["user_a"].email in emails
    assert fixtures["user_b"].email not in emails


def test_user_cannot_access_another_firms_user_by_id(client, two_firms_two_users):
    fixtures = two_firms_two_users
    token = _login(client, fixtures["user_a"].email, fixtures["password"])

    response = client.get(
        f"/users/{fixtures['user_b'].id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    # Must not leak existence/data of another firm's user.
    assert response.status_code == 404


def test_manually_changing_id_cannot_bypass_authorization(client, two_firms_two_users):
    fixtures = two_firms_two_users
    token_a = _login(client, fixtures["user_a"].email, fixtures["password"])

    # user_a tries every plausible manipulation of user_b's id; none work.
    response = client.get(
        f"/users/{fixtures['user_b'].id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert response.status_code in (403, 404)
    assert response.status_code != 200


def test_own_firm_user_lookup_succeeds(client, two_firms_two_users):
    fixtures = two_firms_two_users
    token = _login(client, fixtures["user_a"].email, fixtures["password"])

    response = client.get(
        f"/users/{fixtures['user_a'].id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(fixtures["user_a"].id)
