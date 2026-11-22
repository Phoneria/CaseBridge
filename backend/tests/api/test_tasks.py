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


def test_firm_wide_task_patch_sets_and_resets_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()
    assert task["reminder_days"] is None

    response = client.patch(f"/tasks/{task['id']}", json={"reminder_days": [0, 7, 7]}, headers=headers)
    assert response.status_code == 200
    assert response.json()["reminder_days"] == [7, 0]
    assert response.json()["title"] == "Gorev"

    reset = client.patch(f"/tasks/{task['id']}", json={"reminder_days": None}, headers=headers)
    assert reset.json()["reminder_days"] is None

    assert client.patch(f"/tasks/{task['id']}", json={"reminder_days": [40]}, headers=headers).status_code == 422


def test_case_scoped_task_patch_accepts_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()

    response = client.patch(f"/cases/{case['id']}/tasks/{task['id']}", json={"reminder_days": []}, headers=headers)

    assert response.json()["reminder_days"] == []


def test_firm_wide_task_patch_is_isolated_by_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers_a).json()

    response = client.patch(f"/tasks/{task['id']}", json={"status": "completed"}, headers=headers_b)

    assert response.status_code == 404


def _task_for(client, headers):
    case = _create_case(client, headers)
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers).json()
    return case, task


def test_firm_wide_task_patch_rejects_assignee_from_another_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures, "user_a")
    _, task = _task_for(client, headers)

    response = client.patch(f"/tasks/{task['id']}", json={"assigned_to": fixtures["user_b"].id}, headers=headers)

    assert (response.status_code, response.json()["detail"]) == (404, "Kullanıcı bulunamadı")
    tasks = client.get("/tasks", headers=headers).json()
    assert [t["assigned_to"] for t in tasks if t["id"] == task["id"]] == [None]


def test_case_scoped_task_patch_rejects_assignee_from_another_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures, "user_a")
    case, task = _task_for(client, headers)

    response = client.patch(
        f"/cases/{case['id']}/tasks/{task['id']}", json={"assigned_to": fixtures["user_b"].id}, headers=headers
    )

    assert (response.status_code, response.json()["detail"]) == (404, "Kullanıcı bulunamadı")
    tasks = client.get("/tasks", headers=headers).json()
    assert [t["assigned_to"] for t in tasks if t["id"] == task["id"]] == [None]


def test_task_create_rejects_assignee_from_another_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures, "user_a")
    case = _create_case(client, headers)

    response = client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Gorev", "assigned_to": fixtures["user_b"].id},
        headers=headers,
    )

    assert (response.status_code, response.json()["detail"]) == (404, "Kullanıcı bulunamadı")
    assert client.get(f"/cases/{case['id']}/tasks", headers=headers).json() == []


def test_task_assignee_from_same_firm_is_accepted_and_null_clears_it(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers = _auth_headers(client, fixtures, "user_a")
    _, task = _task_for(client, headers)
    me = fixtures["user_a"].id

    assigned = client.patch(f"/tasks/{task['id']}", json={"assigned_to": me}, headers=headers)
    cleared = client.patch(f"/tasks/{task['id']}", json={"assigned_to": None}, headers=headers)

    assert assigned.json()["assigned_to"] == me
    assert cleared.status_code == 200 and cleared.json()["assigned_to"] is None


def test_task_patch_rejects_null_for_required_fields(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _, task = _task_for(client, headers)

    for field in ("title", "status"):
        response = client.patch(f"/tasks/{task['id']}", json={field: None}, headers=headers)
        assert response.status_code == 422, field


def test_firm_wide_task_patch_unknown_task_is_turkish_404(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    response = client.patch("/tasks/nope", json={"status": "completed"}, headers=headers)
    assert (response.status_code, response.json()["detail"]) == (404, "Görev bulunamadı")


def test_task_create_saves_and_returns_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(
        f"/cases/{case['id']}/tasks", json={"title": "Gorev", "reminder_days": [1, 7, 7, 0]}, headers=headers
    )
    empty = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev", "reminder_days": []}, headers=headers)

    assert response.status_code == 201 and response.json()["reminder_days"] == [7, 1, 0]
    assert empty.json()["reminder_days"] == []


def test_task_create_without_reminder_days_is_null(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers)

    assert response.status_code == 201 and response.json()["reminder_days"] is None


def test_task_create_rejects_invalid_reminder_days(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    for bad in ([31], [-1]):
        response = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev", "reminder_days": bad}, headers=headers)
        assert response.status_code == 422, bad
    assert client.get(f"/cases/{case['id']}/tasks", headers=headers).json() == []


def test_task_create_validates_and_trims_title(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    url = f"/cases/{case['id']}/tasks"

    assert client.post(url, json={"title": ""}, headers=headers).status_code == 422
    assert client.post(url, json={"title": "   "}, headers=headers).status_code == 422
    assert client.post(url, json={"title": "x" * 201}, headers=headers).status_code == 422
    assert client.post(url, json={"title": "x" * 200}, headers=headers).status_code == 201
    trimmed = client.post(url, json={"title": "  Dilekçe hazırla  "}, headers=headers)
    assert trimmed.json()["title"] == "Dilekçe hazırla"


def test_task_create_on_another_firms_case_is_404(client, two_firms_two_users):
    fixtures = two_firms_two_users
    case = _create_case(client, _auth_headers(client, fixtures, "user_a"))
    headers_b = _auth_headers(client, fixtures, "user_b")

    response = client.post(f"/cases/{case['id']}/tasks", json={"title": "Gorev"}, headers=headers_b)

    assert response.status_code == 404


def test_board_stages_and_details_round_trip(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    path = f"/cases/{case['id']}/tasks"
    user = two_firms_two_users["user_a"]
    task = client.post(path, headers=headers, json={"title": "Dilekçe", "stage": "backlog", "priority": "urgent",
        "description": "Ekler beklenecek", "due_date": "2027-02-01", "assigned_to": user.id}).json()
    assert task["assignee_name"] == user.full_name
    path += "/" + task["id"]
    for stage in ("backlog", "todo", "in_progress", "in_review", "done", "in_progress"):
        response = client.patch(path, headers=headers, json={"stage": stage})
        assert response.status_code == 200, response.text
        saved = client.get("/tasks", headers=headers).json()[0]
        assert saved["stage"] == stage and saved["priority"] == "urgent"
        assert (saved["status"] == "completed") == (stage == "done")
        assert bool(saved["completed_at"]) == (stage == "done")
        assert saved["description"] == "Ekler beklenecek" and saved["due_date"] == "2027-02-01"
    assert client.patch(path, headers=headers, json={"stage": "done", "status": "pending"}).status_code == 422
    assert client.patch(path, headers=headers, json={"priority": "tomorrow"}).status_code == 422
    assert client.patch(path, headers=_auth_headers(client,two_firms_two_users,"user_b"),json={"stage":"done"}).status_code == 404


def test_restricted_lawyer_can_only_receive_tasks_in_granted_cases(client, office, auth_headers, db_session):
    from app.models.management import WorkspaceAccess
    headers = auth_headers(office.admin_a)
    case = _create_case(client, headers)
    grant = WorkspaceAccess(law_firm_id=office.firm_a.id, user_id=office.lawyer_a1.id, position="lawyer", case_ids=[])
    db_session.add(grant)
    db_session.commit()
    url = f"/users?task_case_id={case['id']}"
    payload = {"title":"Kontrol", "assigned_to":office.lawyer_a1.id}
    assert office.lawyer_a1.id not in {r["id"] for r in client.get(url, headers=headers).json()}
    assert client.post(f"/cases/{case['id']}/tasks", headers=headers,json=payload).status_code == 422
    grant.case_ids = [case["id"]]
    db_session.commit()
    assert office.lawyer_a1.id in {r["id"] for r in client.get(url, headers=headers).json()}
    assert client.post(f"/cases/{case['id']}/tasks", headers=headers,json=payload).status_code == 201
