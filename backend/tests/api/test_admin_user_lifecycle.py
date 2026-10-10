"""Workload, deactivation with transfer, and re-activation."""
from types import SimpleNamespace

import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.case import Case, CaseStatus, CaseType
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import find_usable_token, issue_token

CONFLICT_TRANSFER = "Açık davaları ve görevleri devretmek için bir avukat seçin."
INVALID_TARGET = "Devredilecek avukat geçersiz."


def _case(db_session, firm, number, owner=None, **kwargs):
    case = Case(
        law_firm_id=firm.id, case_number=number, case_name=f"Dava {number}", client_name="Müvekkil",
        case_type=CaseType.KIRA, assigned_lawyer_id=owner.id if owner else None, **kwargs,
    )
    db_session.add(case)
    db_session.flush()
    return case


def _task(db_session, case, assignee, title, status=TaskStatus.PENDING):
    task = Task(case_id=case.id, law_firm_id=case.law_firm_id, title=title, assigned_to=assignee.id, status=status)
    db_session.add(task)
    db_session.flush()
    return task


@pytest.fixture()
def busy(db_session, office):
    """Ayşe (lawyer_a1) owns two open cases, one closed, one archived, has two
    pending tasks and one done task, and reviews a precedent. Mehmet owns one."""
    ayse, mehmet = office.lawyer_a1, office.lawyer_a2
    open1 = _case(db_session, office.firm_a, "2026/1", ayse)
    open2 = _case(db_session, office.firm_a, "2026/2", ayse, status=CaseStatus.DURUSMA_BEKLEYEN)
    closed = _case(db_session, office.firm_a, "2026/3", ayse, status=CaseStatus.KAPALI)
    archived = _case(db_session, office.firm_a, "2026/4", ayse, is_archived=True)
    mehmets = _case(db_session, office.firm_a, "2026/5", mehmet)
    precedent = _case(db_session, office.firm_a, "Y9HD 2026/1", None, is_precedent=True, reviewer_lawyer_id=ayse.id)
    foreign = _case(db_session, office.firm_b, "2026/6", office.lawyer_b)
    pending1 = _task(db_session, open1, ayse, "Dilekçe hazırla")
    pending2 = _task(db_session, closed, ayse, "Arşive kaldır")
    done = _task(db_session, open1, ayse, "Eski görev", TaskStatus.COMPLETED)
    others = _task(db_session, mehmets, mehmet, "Mehmet'in görevi")
    db_session.commit()
    return SimpleNamespace(
        open1=open1, open2=open2, closed=closed, archived=archived, mehmets=mehmets, precedent=precedent,
        foreign=foreign, pending1=pending1, pending2=pending2, done=done, others=others,
    )


def _deactivate(client, headers, user, transfer_to=None):
    body = {} if transfer_to is None else {"transfer_to": transfer_to}
    return client.post(f"/admin/users/{user.id}/deactivate", json=body, headers=headers)


# --- workload ----------------------------------------------------------------------------

def test_workload_lists_open_cases_pending_tasks_and_precedents(client, office, busy, auth_headers):
    response = client.get(f"/admin/users/{office.lawyer_a1.id}/workload", headers=auth_headers(office.admin_a))

    assert response.status_code == 200
    body = response.json()
    assert [(c["id"], c["case_number"], c["case_name"]) for c in body["open_cases"]] == [
        (busy.open1.id, "2026/1", "Dava 2026/1"),
        (busy.open2.id, "2026/2", "Dava 2026/2"),
    ]
    assert {(t["id"], t["title"], t["case_name"]) for t in body["pending_tasks"]} == {
        (busy.pending1.id, "Dilekçe hazırla", "Dava 2026/1"),
        (busy.pending2.id, "Arşive kaldır", "Dava 2026/3"),
    }
    assert body["precedents_reviewing"] == 1


def test_workload_is_empty_for_a_user_without_work(client, office, auth_headers):
    body = client.get(f"/admin/users/{office.lawyer_a2.id}/workload", headers=auth_headers(office.admin_a)).json()
    assert body == {"open_cases": [], "pending_tasks": [], "precedents_reviewing": 0}


def test_workload_is_admin_only_and_firm_scoped(client, office, busy, auth_headers):
    path = f"/admin/users/{office.lawyer_a1.id}/workload"
    assert client.get(path, headers=auth_headers(office.lawyer_a2)).status_code == 403
    assert client.get(path, headers=auth_headers(office.admin_b)).status_code == 404


# --- deactivate: rules ---------------------------------------------------------------------

def test_deactivating_a_user_without_work_needs_no_transfer(client, db_session, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["is_active"] is False and body["user"]["status"] == "inactive"
    assert body["transferred"] == {"cases": 0, "tasks": 0, "precedents": 0}
    assert client.post("/auth/login", json={"email": office.lawyer_a2.email, "password": office.password}).status_code == 401


def test_work_requires_a_transfer_target(client, db_session, office, busy, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1)

    assert response.status_code == 422
    assert response.json()["detail"] == CONFLICT_TRANSFER
    db_session.refresh(office.lawyer_a1)
    assert office.lawyer_a1.is_active is True


def test_only_pending_tasks_or_only_a_reviewed_precedent_also_require_a_target(client, db_session, office, auth_headers):
    case = _case(db_session, office.firm_a, "2026/9", office.lawyer_a2, status=CaseStatus.KAPALI)
    _task(db_session, case, office.lawyer_a1, "Tek görev")
    db_session.commit()
    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1).json()["detail"] == CONFLICT_TRANSFER

    db_session.query(Task).delete()
    _case(db_session, office.firm_a, "Y9HD 2026/2", None, is_precedent=True, reviewer_lawyer_id=office.lawyer_a1.id)
    db_session.commit()
    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1).json()["detail"] == CONFLICT_TRANSFER


def test_the_transfer_target_must_be_an_active_lawyer_of_the_same_firm(client, db_session, office, busy, auth_headers):
    headers = auth_headers(office.admin_a)
    pending = User(
        law_firm_id=office.firm_a.id, email="beklemede@example.com", hashed_password=hash_password("x"),
        full_name="Bekleyen", role=UserRole.LAWYER, password_set_at=null(), invited_at=utc_now(),
    )
    inactive = User(
        law_firm_id=office.firm_a.id, email="pasif@example.com", hashed_password=hash_password("x"),
        full_name="Pasif", role=UserRole.LAWYER, is_active=False,
    )
    db_session.add_all([pending, inactive])
    db_session.commit()

    for target in (office.lawyer_b.id, office.admin_a.id, office.lawyer_a1.id, pending.id, inactive.id, "yok"):
        response = _deactivate(client, headers, office.lawyer_a1, target)
        assert response.status_code == 422, target
        assert response.json()["detail"] == INVALID_TARGET
    db_session.refresh(office.lawyer_a1)
    assert office.lawyer_a1.is_active is True


def test_an_invalid_target_is_rejected_even_when_there_is_no_work(client, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2, office.lawyer_b.id)
    assert response.status_code == 422 and response.json()["detail"] == INVALID_TARGET


def test_an_admin_cannot_deactivate_themselves(client, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.admin_a)
    assert response.status_code == 409
    assert response.json()["detail"] == "Kendi hesabınızı pasifleştiremezsiniz."


def test_the_last_active_admin_cannot_be_deactivated(db_session, office):
    from app.services.user_admin_service import UserAdminError
    from app.services.user_lifecycle_service import deactivate_user

    outsider = office.lawyer_a2  # any other user acting as the caller
    with pytest.raises(UserAdminError) as error:
        deactivate_user(db_session, outsider, office.admin_a, None)
    assert (error.value.status_code, error.value.detail) == (409, "Büroda en az bir aktif yönetici kalmalı.")


def test_an_inactive_user_cannot_be_deactivated_again(client, db_session, office, auth_headers):
    office.lawyer_a2.is_active = False
    db_session.commit()
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2)
    assert response.status_code == 409 and response.json()["detail"] == "Kullanıcı zaten pasif."


def test_deactivate_and_activate_are_admin_only_and_firm_scoped(client, office, auth_headers):
    for action in ("deactivate", "activate"):
        path = f"/admin/users/{office.lawyer_a2.id}/{action}"
        assert client.post(path, json={}, headers=auth_headers(office.lawyer_a1)).status_code == 403
    foreign = f"/admin/users/{office.lawyer_b.id}"
    assert client.post(f"{foreign}/deactivate", json={}, headers=auth_headers(office.admin_a)).status_code == 404
    assert client.post(f"{foreign}/activate", headers=auth_headers(office.admin_a)).status_code == 404


# --- deactivate: transfer ------------------------------------------------------------------

def test_deactivation_moves_open_cases_pending_tasks_and_precedents_in_one_step(
    client, db_session, office, busy, auth_headers
):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1, office.lawyer_a2.id)

    assert response.status_code == 200
    body = response.json()
    assert body["transferred"] == {"cases": 2, "tasks": 2, "precedents": 1}
    assert body["user"]["status"] == "inactive"

    mehmet = office.lawyer_a2.id
    owners = {c.case_number: (c.assigned_lawyer_id, c.reviewer_lawyer_id) for c in db_session.query(Case).all()}
    assert owners["2026/1"][0] == mehmet and owners["2026/2"][0] == mehmet
    assert owners["2026/3"][0] == office.lawyer_a1.id   # closed: history stays
    assert owners["2026/4"][0] == office.lawyer_a1.id   # archived: history stays
    assert owners["2026/5"][0] == mehmet                # already the target's own case
    assert owners["2026/6"][0] == office.lawyer_b.id    # other firm untouched
    assert owners["Y9HD 2026/1"][1] == mehmet
    tasks = {t.title: t.assigned_to for t in db_session.query(Task).all()}
    assert tasks["Dilekçe hazırla"] == mehmet and tasks["Arşive kaldır"] == mehmet
    assert tasks["Eski görev"] == office.lawyer_a1.id   # completed task stays
    assert tasks["Mehmet'in görevi"] == mehmet

    workload = client.get(f"/admin/users/{office.lawyer_a1.id}/workload", headers=auth_headers(office.admin_a)).json()
    assert workload == {"open_cases": [], "pending_tasks": [], "precedents_reviewing": 0}


def test_deactivation_ends_the_session_and_invalidates_unused_links(client, db_session, office, auth_headers):
    session = auth_headers(office.lawyer_a2)
    invite = issue_token(db_session, office.lawyer_a2, TokenPurpose.INVITE)
    reset = issue_token(db_session, office.lawyer_a2, TokenPurpose.RESET)
    db_session.commit()

    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2).status_code == 200

    assert client.get("/users/me", headers=session).status_code == 401
    assert db_session.query(UserToken).filter(UserToken.user_id == office.lawyer_a2.id, UserToken.used_at.is_(None)).count() == 0
    assert find_usable_token(db_session, invite) is None and find_usable_token(db_session, reset) is None


def test_a_pending_user_can_be_deactivated_to_revoke_the_invitation(client, db_session, office, auth_headers):
    created = client.post(
        "/admin/users", headers=auth_headers(office.admin_a),
        json={"email": "yeni@example.com", "full_name": "Yeni Kişi", "role": "lawyer"},
    ).json()
    response = client.post(f"/admin/users/{created['id']}/deactivate", json={}, headers=auth_headers(office.admin_a))
    assert response.status_code == 200 and response.json()["user"]["status"] == "inactive"


# --- activate ------------------------------------------------------------------------------

def test_activation_restores_login_and_keeps_pending_users_pending(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    assert _deactivate(client, headers, office.lawyer_a2).status_code == 200

    response = client.post(f"/admin/users/{office.lawyer_a2.id}/activate", headers=headers)
    assert response.status_code == 200 and response.json()["status"] == "active"
    assert client.post("/auth/login", json={"email": office.lawyer_a2.email, "password": office.password}).status_code == 200
    assert client.post(f"/admin/users/{office.lawyer_a2.id}/activate", headers=headers).status_code == 200

    created = client.post(
        "/admin/users", headers=headers, json={"email": "yeni@example.com", "full_name": "Yeni Kişi", "role": "lawyer"},
    ).json()
    client.post(f"/admin/users/{created['id']}/deactivate", json={}, headers=headers)
    assert client.post(f"/admin/users/{created['id']}/activate", headers=headers).json()["status"] == "pending"


# --- review fix 1 ----------------------------------------------------------------------------

def test_deactivation_locks_the_user_and_the_target_in_id_order(db_session, office):
    from sqlalchemy.dialects import postgresql

    from app.services.user_lifecycle_service import _lock_statement

    statement = _lock_statement(office.firm_a.id, [office.lawyer_a1.id, office.lawyer_a2.id])
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql and "ORDER BY users.id" in sql


def test_deactivation_executes_the_lock_statement(db_session, office, monkeypatch):
    from app.services import user_lifecycle_service as service

    seen = []
    original = service._lock_statement
    monkeypatch.setattr(service, "_lock_statement", lambda firm, ids: seen.append(ids) or original(firm, ids))
    service.deactivate_user(db_session, office.admin_a, office.lawyer_a1, office.lawyer_a2.id)
    assert seen == [[office.lawyer_a1.id, office.lawyer_a2.id]]


def test_the_target_is_revalidated_on_the_locked_row(db_session, office):
    from app.services.user_admin_service import UserAdminError
    from app.services.user_lifecycle_service import deactivate_user

    office.lawyer_a2.is_active = False
    db_session.commit()
    with pytest.raises(UserAdminError) as error:
        deactivate_user(db_session, office.admin_a, office.lawyer_a1, office.lawyer_a2.id)
    assert (error.value.status_code, error.value.detail) == (422, INVALID_TARGET)


def test_work_that_appears_after_the_workload_check_is_still_moved(db_session, office, busy, monkeypatch):
    from app.schemas.admin_user_lifecycle import WorkloadOut
    from app.services import user_lifecycle_service as service

    monkeypatch.setattr(
        service, "get_workload", lambda db, user: WorkloadOut(open_cases=[], pending_tasks=[], precedents_reviewing=0)
    )
    counts = service.deactivate_user(db_session, office.admin_a, office.lawyer_a1, office.lawyer_a2.id)
    assert counts.model_dump() == {"cases": 2, "tasks": 2, "precedents": 1}
