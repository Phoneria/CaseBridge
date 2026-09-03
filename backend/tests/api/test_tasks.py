"""Task API (Phase 4 - Gorevler): case-scoped CRUD, tenant isolation,
and the firm-wide cross-case list."""

VALID_CASE_PAYLOAD = {
    "case_number": "2026/701",
    "case_name": "Is Sozlesmesi Feshi Davasi",
    "client_name": "Ayse Kaya",
    "opposing_party": "ABC Sirketi",
    "case_type": "is_hukuku",
    "court": "Ankara 3. Is Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers):
    return client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()


def test_create_task_defaults_to_pending(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Bilirkisi raporunu incele", "due_date": "2026-09-01"},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["title"] == "Bilirkisi raporunu incele"
    assert body["completed_at"] is None


def test_list_case_tasks_returns_created_tasks(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev 1"}, headers=headers)
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev 2"}, headers=headers)

    response = client.get(f"/cases/{case['id']}/tasks", headers=headers)
    assert response.status_code == 200
    titles = {t["title"] for t in response.json()}
    assert titles == {"Gorev 1", "Gorev 2"}


def test_update_task_marks_completed_and_sets_completed_at(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()

    response = client.patch(
        f"/cases/{case['id']}/tasks/{task['id']}", json={"status": "completed"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["completed_at"] is not None


def test_reopening_a_completed_task_clears_completed_at(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()
    client.patch(f"/cases/{case['id']}/tasks/{task['id']}", json={"status": "completed"}, headers=headers)

    response = client.patch(
        f"/cases/{case['id']}/tasks/{task['id']}", json={"status": "pending"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is None


def test_tasks_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    case = _create_case(client, headers_a)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers_a).json()

    assert client.get(f"/cases/{case['id']}/tasks", headers=headers_b).status_code == 404
    assert client.post(f"/cases/{case['id']}/tasks", json={"title": "x"}, headers=headers_b).status_code == 404
    assert (
        client.patch(
            f"/cases/{case['id']}/tasks/{task['id']}", json={"status": "completed"}, headers=headers_b
        ).status_code
        == 404
    )


def test_global_task_list_includes_case_name_and_number(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers)

    response = client.get("/tasks", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["case_name"] == VALID_CASE_PAYLOAD["case_name"]
    assert body[0]["case_number"] == VALID_CASE_PAYLOAD["case_number"]


def test_global_task_list_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers_a)

    response = client.get("/tasks", headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []


def test_global_task_list_can_filter_by_status(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    pending_task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Pending"}, headers=headers).json()
    completed_task = client.post(
        f"/cases/{case['id']}/tasks", json={"title": "Completed"}, headers=headers
    ).json()
    client.patch(
        f"/cases/{case['id']}/tasks/{completed_task['id']}", json={"status": "completed"}, headers=headers
    )

    response = client.get("/tasks", params={"status": "pending"}, headers=headers)
    titles = {t["title"] for t in response.json()}
    assert titles == {"Pending"}
    assert pending_task["title"] in titles
