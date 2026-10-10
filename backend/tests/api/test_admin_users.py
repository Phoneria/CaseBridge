"""/admin/users: list, create (invite), edit, resend invite, password reset,
admin guards, firm isolation and the assignable-user lists."""
import pytest
from sqlalchemy import null

from app.core.config import settings
from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.case import Case, CaseType
from app.models.user import User, UserRole
from app.models.user_token import UserToken

NEW_USER = {"email": "Yeni.Avukat@Example.com", "full_name": "  Yeni   Avukat ", "department": "İş Hukuku", "role": "lawyer"}


def _pending(db_session, firm, email="beklemede@example.com", role=UserRole.LAWYER, name="Bekleyen Avukat"):
    user = User(
        law_firm_id=firm.id, email=email, hashed_password=hash_password("placeholder-1234"),
        full_name=name, role=role, password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


# --- access ----------------------------------------------------------------------------

def test_only_admins_can_use_the_user_endpoints(client, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    other = office.lawyer_a2.id
    calls = [
        ("get", "/admin/users", None),
        ("post", "/admin/users", NEW_USER),
        ("patch", f"/admin/users/{other}", {"full_name": "X"}),
        ("post", f"/admin/users/{other}/invite", None),
        ("post", f"/admin/users/{other}/password-reset", None),
    ]
    for method, path, body in calls:
        kwargs = {"json": body} if body else {}
        assert getattr(client, method)(path, headers=lawyer, **kwargs).status_code == 403, (method, path)
        assert getattr(client, method)(path, **kwargs).status_code == 401, (method, path)


# --- list --------------------------------------------------------------------------------

def test_list_returns_every_user_of_the_firm_with_a_derived_status(client, db_session, office, auth_headers):
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    db_session.commit()

    rows = client.get("/admin/users", headers=auth_headers(office.admin_a)).json()

    assert {row["email"]: row["status"] for row in rows} == {
        office.admin_a.email: "active",
        office.lawyer_a1.email: "active",
        office.lawyer_a2.email: "inactive",
        pending.email: "pending",
    }
    row = next(r for r in rows if r["email"] == pending.email)
    assert set(row) == {
        "id", "email", "full_name", "department", "role", "is_active", "status",
        "invited_at", "password_set_at", "created_at",
    }
    assert row["password_set_at"] is None and row["invited_at"] is not None
    assert "hashed_password" not in row


# --- create ------------------------------------------------------------------------------

def test_create_user_makes_a_pending_user_and_e_mails_an_invite(client, db_session, office, auth_headers, mail_outbox):
    response = client.post("/admin/users", json=NEW_USER, headers=auth_headers(office.admin_a))

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "yeni.avukat@example.com"
    assert body["full_name"] == "Yeni Avukat"
    assert (body["department"], body["role"], body["status"], body["email_sent"]) == ("İş Hukuku", "lawyer", "pending", True)
    assert body["password_set_at"] is None and body["invited_at"] is not None

    user = db_session.query(User).filter_by(email="yeni.avukat@example.com").one()
    assert user.law_firm_id == office.firm_a.id and user.password_set_at is None
    [message] = mail_outbox.messages("yeni.avukat@example.com")
    assert message["Subject"] == "CaseBridge davetiniz — Demir Hukuk"
    assert "Yönetici A sizi Demir Hukuk bürosunun" in message.get_body(preferencelist=("plain",)).get_content()
    token = mail_outbox.latest_token("yeni.avukat@example.com")

    invited_login = client.post("/auth/login", json={"email": "yeni.avukat@example.com", "password": "anything-at-all"})
    assert invited_login.status_code == 401
    assert client.post("/auth/set-password", json={"token": token, "password": "secilen-sifre-123"}).status_code == 200


def test_create_user_rejects_a_taken_email_in_any_firm_and_case(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    for email in (office.lawyer_a1.email, office.lawyer_b.email.upper()):
        response = client.post("/admin/users", json={**NEW_USER, "email": email}, headers=headers)
        assert response.status_code == 409
        assert response.json()["detail"] == "Bu e-posta adresi zaten kayıtlı."


def test_create_user_reports_a_failed_invite_e_mail_but_still_creates_the_user(
    client, db_session, office, auth_headers, monkeypatch, tmp_path
):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    response = client.post("/admin/users", json=NEW_USER, headers=auth_headers(office.admin_a))

    assert response.status_code == 201
    assert response.json()["email_sent"] is False
    assert db_session.query(User).filter_by(email="yeni.avukat@example.com").count() == 1
    assert db_session.query(UserToken).count() == 1


def test_create_user_validates_input(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    assert client.post("/admin/users", json={**NEW_USER, "email": "not-an-email"}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "full_name": "   "}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "role": "owner"}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "department": "x" * 101}, headers=headers).status_code == 422
    blank = client.post("/admin/users", json={**NEW_USER, "department": "  "}, headers=headers)
    assert blank.status_code == 201 and blank.json()["department"] is None


# --- edit --------------------------------------------------------------------------------

def test_edit_changes_name_department_role_and_email(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    response = client.patch(
        f"/admin/users/{office.lawyer_a1.id}",
        json={"full_name": "Ayşe Yılmaz", "department": "Kira Hukuku", "role": "admin", "email": "AYSE.YILMAZ@example.com"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["department"], body["role"], body["email"]) == (
        "Ayşe Yılmaz", "Kira Hukuku", "admin", "ayse.yilmaz@example.com",
    )

    cleared = client.patch(f"/admin/users/{office.lawyer_a1.id}", json={"department": None}, headers=headers)
    assert cleared.json()["department"] is None and cleared.json()["full_name"] == "Ayşe Yılmaz"


def test_edit_rejects_null_required_fields_and_taken_emails(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    path = f"/admin/users/{office.lawyer_a1.id}"
    for body in ({"full_name": None}, {"role": None}, {"email": None}, {"full_name": " "}):
        assert client.patch(path, json=body, headers=headers).status_code == 422, body
    taken = client.patch(path, json={"email": office.lawyer_a2.email}, headers=headers)
    assert taken.status_code == 409 and taken.json()["detail"] == "Bu e-posta adresi zaten kayıtlı."
    assert client.patch(path, json={"email": office.lawyer_a1.email.upper()}, headers=headers).status_code == 200


def test_an_admin_cannot_change_their_own_role(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    response = client.patch(f"/admin/users/{office.admin_a.id}", json={"role": "lawyer"}, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "Kendi rolünüzü değiştiremezsiniz."
    assert client.patch(f"/admin/users/{office.admin_a.id}", json={"role": "admin", "full_name": "Yeni Ad"}, headers=headers).status_code == 200


def test_the_last_active_admin_cannot_be_demoted(db_session, office):
    from app.services.user_admin_service import UserAdminError, count_other_active_admins, ensure_not_last_admin

    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 0
    with pytest.raises(UserAdminError) as error:
        ensure_not_last_admin(db_session, office.admin_a)
    assert (error.value.status_code, error.value.detail) == (409, "Büroda en az bir aktif yönetici kalmalı.")

    second = _pending(db_session, office.firm_a, email="yonetici2@example.com", role=UserRole.ADMIN)
    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 0  # still pending
    second.password_set_at = utc_now()
    db_session.commit()
    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 1
    ensure_not_last_admin(db_session, office.admin_a)


def test_demoting_another_admin_works_while_an_admin_remains(client, db_session, office, auth_headers):
    second = User(
        law_firm_id=office.firm_a.id, email="yonetici2@example.com", hashed_password=hash_password("x"),
        full_name="İkinci Yönetici", role=UserRole.ADMIN,
    )
    db_session.add(second)
    db_session.commit()

    response = client.patch(f"/admin/users/{second.id}", json={"role": "lawyer"}, headers=auth_headers(office.admin_a))
    assert response.status_code == 200 and response.json()["role"] == "lawyer"


def test_changing_a_pending_users_email_invalidates_the_old_link(client, db_session, office, auth_headers, mail_outbox):
    headers = auth_headers(office.admin_a)
    created = client.post("/admin/users", json=NEW_USER, headers=headers).json()
    old_token = mail_outbox.latest_token("yeni.avukat@example.com")

    client.patch(f"/admin/users/{created['id']}", json={"email": "baska@example.com"}, headers=headers)

    assert client.get("/auth/token-info", params={"token": old_token}).status_code == 410
    client.post(f"/admin/users/{created['id']}/invite", headers=headers)
    new_token = mail_outbox.latest_token("baska@example.com")
    assert client.get("/auth/token-info", params={"token": new_token}).json()["email"] == "baska@example.com"


# --- resend invite -----------------------------------------------------------------------

def test_resend_invite_replaces_the_old_link(client, db_session, office, auth_headers, mail_outbox):
    headers = auth_headers(office.admin_a)
    created = client.post("/admin/users", json=NEW_USER, headers=headers).json()
    first = mail_outbox.latest_token("yeni.avukat@example.com")

    response = client.post(f"/admin/users/{created['id']}/invite", headers=headers)

    assert response.status_code == 200
    assert response.json()["email_sent"] is True and response.json()["status"] == "pending"
    second = mail_outbox.latest_token("yeni.avukat@example.com")
    assert first != second
    assert client.get("/auth/token-info", params={"token": first}).status_code == 410
    assert client.get("/auth/token-info", params={"token": second}).status_code == 200


def test_resend_invite_is_only_for_pending_active_users(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    done = client.post(f"/admin/users/{office.lawyer_a1.id}/invite", headers=headers)
    assert done.status_code == 409 and done.json()["detail"] == "Kullanıcı şifresini zaten belirlemiş."

    inactive = _pending(db_session, office.firm_a)
    inactive.is_active = False
    db_session.commit()
    assert client.post(f"/admin/users/{inactive.id}/invite", headers=headers).status_code == 409


# --- password reset ----------------------------------------------------------------------

def test_admin_can_send_a_reset_link_to_an_active_user(client, office, auth_headers, mail_outbox):
    old_session = auth_headers(office.lawyer_a1)
    response = client.post(f"/admin/users/{office.lawyer_a1.id}/password-reset", headers=auth_headers(office.admin_a))

    assert response.status_code == 200 and response.json() == {"email_sent": True}
    [message] = mail_outbox.messages(office.lawyer_a1.email)
    assert message["Subject"] == "CaseBridge şifre sıfırlama"
    assert client.get("/users/me", headers=old_session).status_code == 200  # sessions end only when the password is set


def test_password_reset_is_only_for_active_users_with_a_password(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    db_session.commit()

    for user in (pending, office.lawyer_a2):
        assert client.post(f"/admin/users/{user.id}/password-reset", headers=headers).status_code == 409


# --- firm isolation ----------------------------------------------------------------------

def test_users_of_other_firms_are_invisible(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    foreign = office.lawyer_b.id

    rows = client.get("/admin/users", headers=headers).json()
    assert office.lawyer_b.email not in {row["email"] for row in rows}
    assert client.patch(f"/admin/users/{foreign}", json={"full_name": "X"}, headers=headers).status_code == 404
    assert client.post(f"/admin/users/{foreign}/invite", headers=headers).status_code == 404
    assert client.post(f"/admin/users/{foreign}/password-reset", headers=headers).status_code == 404
    assert client.patch("/admin/users/does-not-exist", json={"full_name": "X"}, headers=headers).status_code == 404


# --- pending users are not assignable ------------------------------------------------------

def test_pending_and_inactive_users_are_not_offered_or_accepted_as_assignees(client, db_session, office, auth_headers):
    admin = auth_headers(office.admin_a)
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    case = Case(
        law_firm_id=office.firm_a.id, case_number="2026/1", case_name="Dava", client_name="Müvekkil",
        case_type=CaseType.KIRA, assigned_lawyer_id=office.lawyer_a1.id,
    )
    db_session.add(case)
    db_session.commit()

    assert [row["id"] for row in client.get("/admin/lawyers", headers=admin).json()] == [office.lawyer_a1.id]
    assert {row["id"] for row in client.get("/users", headers=admin).json()} == {office.admin_a.id, office.lawyer_a1.id}
    for lawyer in (pending, office.lawyer_a2):
        assert client.patch(f"/admin/cases/{case.id}/lawyer", json={"assigned_lawyer_id": lawyer.id}, headers=admin).status_code == 422
        created = client.post("/cases", json={
            "case_number": "2026/2", "case_name": "Yeni", "client_name": "M", "case_type": "kira",
            "assigned_lawyer_id": lawyer.id,
        }, headers=admin)
        assert created.status_code == 422

    overview = client.get("/analytics/overview", headers=admin).json()
    assert pending.id not in {row["lawyer_id"] for row in overview["by_lawyer"]}
