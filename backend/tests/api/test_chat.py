"""Chat assistant API (Hukuk Asistanı)."""
from app.services.chat_service import make_title


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _second_user_same_firm(db_session, fixtures):
    from app.core.security import hash_password
    from app.models.user import User, UserRole

    user = User(
        law_firm_id=fixtures["firm_a"].id,
        email="avukat.a2@demo.casebridge.dev",
        hashed_password=hash_password(fixtures["password"]),
        full_name="Avukat A2",
        role=UserRole.LAWYER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_chat_status_reports_mock_provider(client, two_firms_two_users):
    body = client.get("/chat/status", headers=_headers(client, two_firms_two_users)).json()
    assert body == {"provider": "mock", "model": "mock", "configured": True, "external": False, "error": None}


def test_create_list_rename_and_delete_conversation(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)

    created = client.post("/chat/conversations", headers=headers)
    assert created.status_code == 201
    conversation = created.json()
    assert conversation["title"] == "Yeni sohbet"
    assert conversation["messages"] == []

    listed = client.get("/chat/conversations", headers=headers).json()
    assert [c["id"] for c in listed] == [conversation["id"]]

    renamed = client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "  Kira hukuku  "}, headers=headers)
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Kira hukuku"

    assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "   "}, headers=headers).status_code == 422
    assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "x" * 121}, headers=headers).status_code == 422

    assert client.delete(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 204
    assert client.get(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404
    assert client.get("/chat/conversations", headers=headers).json() == []


def test_conversations_are_private_to_their_user(client, two_firms_two_users, db_session):
    fixtures = two_firms_two_users
    headers_a = _headers(client, fixtures, "user_a")
    conversation = client.post("/chat/conversations", headers=headers_a).json()

    colleague = _second_user_same_firm(db_session, fixtures)
    colleague_headers = {
        "Authorization": "Bearer "
        + client.post("/auth/login", json={"email": colleague.email, "password": fixtures["password"]}).json()["access_token"]
    }
    other_firm_headers = _headers(client, fixtures, "user_b")

    for headers in (colleague_headers, other_firm_headers):
        assert client.get("/chat/conversations", headers=headers).json() == []
        assert client.get(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404
        assert client.patch(f"/chat/conversations/{conversation['id']}", json={"title": "x"}, headers=headers).status_code == 404
        assert client.delete(f"/chat/conversations/{conversation['id']}", headers=headers).status_code == 404


def test_make_title_collapses_whitespace_and_truncates():
    assert make_title("  Kira   artışı\nnasıl hesaplanır? ") == "Kira artışı nasıl hesaplanır?"
    long = "a" * 70
    assert make_title(long) == "a" * 60 + "…"
