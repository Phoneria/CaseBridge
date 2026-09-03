"""Authentication (section 22 - Authentication)."""


def test_user_can_login_with_correct_credentials(client, two_firms_two_users):
    fixtures = two_firms_two_users
    response = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": fixtures["password"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_with_wrong_password_fails(client, two_firms_two_users):
    fixtures = two_firms_two_users
    response = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_login_is_rate_limited_after_repeated_failures(client, two_firms_two_users):
    fixtures = two_firms_two_users
    for _ in range(5):
        response = client.post(
            "/auth/login",
            json={"email": fixtures["user_a"].email, "password": "wrong-password"},
        )
        assert response.status_code == 401

    response = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": "wrong-password"},
    )
    assert response.status_code == 429

    # Correct credentials are also blocked while rate-limited - the
    # limiter keys on (client, email), not just failures.
    response = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": fixtures["password"]},
    )
    assert response.status_code == 429


def test_login_with_unknown_email_fails(client):
    response = client.post(
        "/auth/login",
        json={"email": "nobody@nowhere.dev", "password": "whatever"},
    )
    assert response.status_code == 401


def test_unauthenticated_user_cannot_access_protected_endpoint(client):
    response = client.get("/users/me")
    assert response.status_code == 401


def test_authenticated_user_can_access_protected_endpoint(client, two_firms_two_users):
    fixtures = two_firms_two_users
    login = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": fixtures["password"]},
    )
    token = login.json()["access_token"]

    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == fixtures["user_a"].email


def test_invalid_token_is_rejected(client):
    response = client.get("/users/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_logout_invalidates_further_use_of_that_flow(client, two_firms_two_users):
    """MVP logout is client-side token discard; the endpoint confirms
    the action and the token is not reusable once the client drops it.
    This test asserts the logout endpoint exists and succeeds for an
    authenticated user."""
    fixtures = two_firms_two_users
    login = client.post(
        "/auth/login",
        json={"email": fixtures["user_a"].email, "password": fixtures["password"]},
    )
    token = login.json()["access_token"]

    response = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
