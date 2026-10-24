"""/platform: only platform admins; firms are listed (the platform firm never),
created with an invited admin, get extra admins and re-sent invites, and are
suspended / re-activated."""
import logging
from types import SimpleNamespace

import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.case import Case, CaseType
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.services import platform_service
from app.services.firm_access import FIRM_SUSPENDED
from app.services.user_admin_service import EMAIL_TAKEN

NEW_FIRM = {"name": "  Yıldız   Hukuk ", "admin_full_name": "Selin Yıldız", "admin_email": "Selin@Yildiz.Example.com"}


@pytest.fixture()
def platform(db_session, office, auth_headers):
    firm = platform_service.get_or_create_platform_firm(db_session)
    user = User(
        law_firm_id=firm.id, email="ops@casebridge.example.com", hashed_password=hash_password(office.password),
        full_name="Platform Ekibi", role=UserRole.ADMIN, is_platform_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    return SimpleNamespace(firm=firm, user=user, headers=auth_headers(user))


def _pending_admin(db_session, firm, email="bekleyen.yonetici@example.com"):
    user = User(
        law_firm_id=firm.id, email=email, hashed_password=hash_password("placeholder-1234"),
        full_name="Bekleyen Yönetici", role=UserRole.ADMIN, password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_only_platform_admins_can_use_the_platform_endpoints(client, office, platform, auth_headers):
    firm_id = office.firm_b.id
    calls = [
        ("get", "/platform/firms", None),
        ("post", "/platform/firms", NEW_FIRM),
        ("post", f"/platform/firms/{firm_id}/admins", {"full_name": "X", "email": "x@example.com"}),
        ("post", f"/platform/firms/{firm_id}/admins/{office.admin_b.id}/invite", None),
        ("post", f"/platform/firms/{firm_id}/suspend", None),
        ("post", f"/platform/firms/{firm_id}/activate", None),
    ]
    for user in (office.lawyer_a1, office.admin_a):
        headers = auth_headers(user)
        for method, path, body in calls:
            kwargs = {"json": body} if body else {}
            response = getattr(client, method)(path, headers=headers, **kwargs)
            assert response.status_code == 403, (user.email, method, path)
            assert response.json()["detail"] == "Platform yetkisi gerekli."
    for method, path, body in calls:
        kwargs = {"json": body} if body else {}
        assert getattr(client, method)(path, **kwargs).status_code == 401, (method, path)


def test_me_reports_the_platform_admin(client, platform):
    assert client.get("/users/me", headers=platform.headers).json()["is_platform_admin"] is True


def test_list_shows_customer_firms_with_their_admins_and_hides_the_platform_firm(client, db_session, office, platform):
    pending = _pending_admin(db_session, office.firm_a)

    rows = client.get("/platform/firms", headers=platform.headers).json()

    assert [row["name"] for row in rows] == ["Demir Hukuk", "Kaya Hukuk"]
    demir = rows[0]
    assert set(demir) == {"id", "name", "created_at", "is_active", "suspended_at", "active_user_count", "admins"}
    assert (demir["is_active"], demir["suspended_at"], demir["active_user_count"]) == (True, None, 3)
    assert {admin["email"]: admin["status"] for admin in demir["admins"]} == {
        office.admin_a.email: "active", pending.email: "pending",
    }
    assert set(demir["admins"][0]) == {"id", "full_name", "email", "status", "invited_at"}


def test_create_firm_makes_a_pending_admin_who_can_set_a_password(client, db_session, platform, mail_outbox):
    response = client.post("/platform/firms", json=NEW_FIRM, headers=platform.headers)

    assert response.status_code == 201
    body = response.json()
    assert body["email_sent"] is True
    assert (body["firm"]["name"], body["firm"]["is_active"]) == ("Yıldız Hukuk", True)
    assert (body["admin"]["email"], body["admin"]["full_name"], body["admin"]["status"]) == (
        "selin@yildiz.example.com", "Selin Yıldız", "pending",
    )
    assert [admin["id"] for admin in body["firm"]["admins"]] == [body["admin"]["id"]]
    user = db_session.query(User).filter_by(email="selin@yildiz.example.com").one()
    assert (user.role, user.is_platform_admin, user.law_firm.name) == (UserRole.ADMIN, False, "Yıldız Hukuk")
    [message] = mail_outbox.messages(to="selin@yildiz.example.com")
    assert "Yıldız Hukuk" in message["Subject"]

    token = mail_outbox.latest_token("selin@yildiz.example.com")
    set_response = client.post("/auth/set-password", json={"token": token, "password": "Yeni-Sifre-2026"})
    assert set_response.status_code == 200
    me = client.get("/users/me", headers={"Authorization": f"Bearer {set_response.json()['access_token']}"}).json()
    assert (me["role"], me["is_platform_admin"]) == ("admin", False)


def test_create_rejects_a_firm_name_that_exists_ignoring_case(client, db_session, platform):
    response = client.post("/platform/firms", json={**NEW_FIRM, "name": "demir HUKUK"}, headers=platform.headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Bu adla bir büro zaten var."
    assert db_session.query(LawFirm).count() == 3  # Demir, Kaya and the platform firm


def test_create_rejects_a_registered_e_mail_and_leaves_no_firm(client, db_session, office, platform):
    response = client.post(
        "/platform/firms", json={**NEW_FIRM, "admin_email": office.lawyer_b.email}, headers=platform.headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == EMAIL_TAKEN
    assert db_session.query(LawFirm).filter_by(name="Yıldız Hukuk").count() == 0


def test_create_validates_the_firm_name(client, platform):
    response = client.post("/platform/firms", json={**NEW_FIRM, "name": "   "}, headers=platform.headers)
    assert response.status_code == 422


def test_a_failed_e_mail_keeps_the_firm_and_reports_it(client, db_session, platform, monkeypatch):
    monkeypatch.setattr(platform_service, "deliver", lambda message: False)

    response = client.post("/platform/firms", json=NEW_FIRM, headers=platform.headers)

    assert response.status_code == 201
    assert response.json()["email_sent"] is False
    assert db_session.query(LawFirm).filter_by(name="Yıldız Hukuk").count() == 1


def test_add_admin_invites_a_second_admin(client, office, platform, mail_outbox):
    response = client.post(
        f"/platform/firms/{office.firm_b.id}/admins",
        json={"full_name": "  İkinci   Yönetici ", "email": "Ikinci@Kaya.Example.com"},
        headers=platform.headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["admin"]["full_name"], body["admin"]["status"], body["email_sent"]) == ("İkinci Yönetici", "pending", True)
    assert len(mail_outbox.messages(to="ikinci@kaya.example.com")) == 1
    firm = next(row for row in client.get("/platform/firms", headers=platform.headers).json() if row["name"] == "Kaya Hukuk")
    assert len(firm["admins"]) == 2


def test_resend_invite_only_for_a_pending_admin_of_that_firm(client, db_session, office, platform, mail_outbox):
    pending = _pending_admin(db_session, office.firm_b)
    base = f"/platform/firms/{office.firm_b.id}/admins"

    response = client.post(f"{base}/{pending.id}/invite", headers=platform.headers)
    assert response.status_code == 200
    assert response.json()["email_sent"] is True
    assert len(mail_outbox.messages(to=pending.email)) == 1

    assert client.post(f"{base}/{office.admin_b.id}/invite", headers=platform.headers).status_code == 409
    assert client.post(f"{base}/{office.lawyer_b.id}/invite", headers=platform.headers).status_code == 404
    assert client.post(f"{base}/{office.admin_a.id}/invite", headers=platform.headers).status_code == 404


def test_the_platform_firm_is_not_reachable(client, platform):
    firm_id = platform.firm.id
    for path in (f"/platform/firms/{firm_id}/suspend", f"/platform/firms/{firm_id}/activate"):
        response = client.post(path, headers=platform.headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Büro bulunamadı."
    assert client.post("/platform/firms/yok/suspend", headers=platform.headers).status_code == 404


def test_suspend_and_activate(client, db_session, office, platform):
    url = f"/platform/firms/{office.firm_b.id}"

    first = client.post(f"{url}/suspend", headers=platform.headers).json()
    assert first["is_active"] is False and first["suspended_at"] is not None
    again = client.post(f"{url}/suspend", headers=platform.headers).json()
    assert again["suspended_at"] == first["suspended_at"]
    login = client.post("/auth/login", json={"email": office.lawyer_b.email, "password": office.password})
    assert (login.status_code, login.json()["detail"]) == (403, FIRM_SUSPENDED)

    activated = client.post(f"{url}/activate", headers=platform.headers).json()
    assert (activated["is_active"], activated["suspended_at"]) == (True, None)
    login = client.post("/auth/login", json={"email": office.lawyer_b.email, "password": office.password})
    assert login.status_code == 200


def test_a_suspended_firm_gets_admins_but_no_invite_e_mails(client, db_session, office, platform, mail_outbox):
    pending = _pending_admin(db_session, office.firm_b)
    client.post(f"/platform/firms/{office.firm_b.id}/suspend", headers=platform.headers)

    added = client.post(
        f"/platform/firms/{office.firm_b.id}/admins",
        json={"full_name": "Yeni Yönetici", "email": "yeni.yonetici@example.com"},
        headers=platform.headers,
    )
    assert added.status_code == 201
    assert added.json()["email_sent"] is False
    assert mail_outbox.messages(to="yeni.yonetici@example.com") == []

    resend = client.post(f"/platform/firms/{office.firm_b.id}/admins/{pending.id}/invite", headers=platform.headers)
    assert (resend.status_code, resend.json()["detail"]) == (409, "Askıdaki büroya davet gönderilemez.")


def _platform_log(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "casebridge" and r.getMessage().startswith("Platform işlemi")]


def test_platform_actions_are_logged_with_ids_only(client, db_session, office, platform, mail_outbox, caplog):
    caplog.set_level(logging.INFO, logger="casebridge")
    actor = platform.user.id
    firm_id = office.firm_b.id

    created = client.post("/platform/firms", json=NEW_FIRM, headers=platform.headers).json()
    added = client.post(
        f"/platform/firms/{firm_id}/admins",
        json={"full_name": "İkinci Yönetici", "email": "ikinci@kaya.example.com"},
        headers=platform.headers,
    ).json()
    client.post(f"/platform/firms/{firm_id}/admins/{added['admin']['id']}/invite", headers=platform.headers)
    client.post(f"/platform/firms/{firm_id}/suspend", headers=platform.headers)
    client.post(f"/platform/firms/{firm_id}/suspend", headers=platform.headers)  # unchanged: no line
    client.post(f"/platform/firms/{firm_id}/activate", headers=platform.headers)
    client.post(f"/platform/firms/{firm_id}/activate", headers=platform.headers)  # unchanged: no line

    assert _platform_log(caplog) == [
        f"Platform işlemi: büro_oluşturuldu büro={created['firm']['id']} yönetici={created['admin']['id']} işlemi yapan={actor}",
        f"Platform işlemi: yönetici_eklendi büro={firm_id} yönetici={added['admin']['id']} işlemi yapan={actor}",
        f"Platform işlemi: davet_yeniden_gönderildi büro={firm_id} yönetici={added['admin']['id']} işlemi yapan={actor}",
        f"Platform işlemi: büro_askıya_alındı büro={firm_id} yönetici=- işlemi yapan={actor}",
        f"Platform işlemi: büro_aktifleştirildi büro={firm_id} yönetici=- işlemi yapan={actor}",
    ]
    # (The dev "file" mail backend logs recipients itself; that is outside this audit trail.)
    assert all("@" not in message for message in _platform_log(caplog))


def test_a_customer_user_with_a_stray_platform_flag_is_refused(client, db_session, office, auth_headers):
    office.admin_a.is_platform_admin = True
    db_session.commit()

    response = client.get("/platform/firms", headers=auth_headers(office.admin_a))

    assert response.status_code == 403
    assert response.json()["detail"] == "Platform yetkisi gerekli."


def test_a_platform_admin_cannot_read_a_customer_firms_case(client, db_session, office, platform):
    case = Case(
        law_firm_id=office.firm_b.id, case_number="2026/7", case_name="Dava", client_name="Müvekkil",
        case_type=CaseType.KIRA, assigned_lawyer_id=office.lawyer_b.id,
    )
    db_session.add(case)
    db_session.commit()

    assert client.get(f"/cases/{case.id}", headers=platform.headers).status_code == 404
