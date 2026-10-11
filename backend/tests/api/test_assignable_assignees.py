"""Tasks and calendar events can only be assigned to users who can work:
active and past the invitation (password set) - the rule cases use."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseType
from app.models.task import Task
from app.models.user import User, UserRole

NOT_ASSIGNABLE = "Seçilen kullanıcı atanamaz."


@pytest.fixture()
def team(db_session, office):
    """Firm A gets a pending invitee and an inactive lawyer, and a case."""
    pending = User(law_firm_id=office.firm_a.id, email="davetli@example.com", hashed_password=hash_password("x" * 12),
                   full_name="Davetli", role=UserRole.LAWYER, is_active=True, password_set_at=null())
    inactive = User(law_firm_id=office.firm_a.id, email="eski@example.com", hashed_password=hash_password("x" * 12),
                    full_name="Eski Avukat", role=UserRole.LAWYER, is_active=False)
    case = Case(law_firm_id=office.firm_a.id, case_number="2026/50", case_name="Dava", client_name="M",
                case_type=CaseType.KIRA, assigned_lawyer_id=office.lawyer_a1.id)
    db_session.add_all([pending, inactive, case])
    db_session.commit()
    return pending, inactive, case


def _event_body(**extra):
    starts = (datetime.now() + timedelta(days=3)).replace(microsecond=0).isoformat()
    return {"title": "Toplantı", "event_type": "meeting", "starts_at": starts, **extra}


@pytest.mark.parametrize("who", [0, 1])
def test_task_create_refuses_a_pending_or_inactive_assignee(client, office, team, auth_headers, who):
    case = team[2]
    response = client.post(f"/cases/{case.id}/tasks", json={"title": "Görev", "assigned_to": team[who].id},
                           headers=auth_headers(office.admin_a))
    assert response.status_code == 422 and response.json()["detail"] == NOT_ASSIGNABLE


@pytest.mark.parametrize("who", [0, 1])
def test_task_update_refuses_a_pending_or_inactive_assignee(client, office, team, auth_headers, who):
    headers = auth_headers(office.admin_a)
    case = team[2]
    task = client.post(f"/cases/{case.id}/tasks", json={"title": "Görev"}, headers=headers).json()

    scoped = client.patch(f"/cases/{case.id}/tasks/{task['id']}", json={"assigned_to": team[who].id}, headers=headers)
    firm_wide = client.patch(f"/tasks/{task['id']}", json={"assigned_to": team[who].id}, headers=headers)

    assert scoped.status_code == 422 and scoped.json()["detail"] == NOT_ASSIGNABLE
    assert firm_wide.status_code == 422 and firm_wide.json()["detail"] == NOT_ASSIGNABLE


def test_a_task_of_a_deactivated_assignee_can_still_be_edited(client, db_session, office, team, auth_headers):
    headers = auth_headers(office.admin_a)
    case, inactive = team[2], team[1]
    task = Task(case_id=case.id, law_firm_id=case.law_firm_id, title="Eski", assigned_to=inactive.id)
    db_session.add(task)
    db_session.commit()

    response = client.patch(f"/tasks/{task.id}", json={"title": "Yeni başlık", "assigned_to": inactive.id}, headers=headers)
    assert response.status_code == 200 and response.json()["title"] == "Yeni başlık"
    assert client.patch(f"/tasks/{task.id}", json={"status": "completed"}, headers=headers).status_code == 200
    moved = client.patch(f"/tasks/{task.id}", json={"assigned_to": office.lawyer_a2.id}, headers=headers)
    assert moved.status_code == 200 and moved.json()["assigned_to"] == office.lawyer_a2.id


def test_task_assignee_of_another_firm_is_still_404(client, office, team, auth_headers):
    response = client.post(f"/cases/{team[2].id}/tasks", json={"title": "Görev", "assigned_to": office.lawyer_b.id},
                           headers=auth_headers(office.admin_a))
    assert response.status_code == 404


@pytest.mark.parametrize("who", [0, 1])
def test_calendar_create_refuses_a_pending_or_inactive_assignee(client, office, team, auth_headers, who):
    response = client.post("/calendar/events", json=_event_body(assignee_id=team[who].id),
                           headers=auth_headers(office.admin_a))
    assert response.status_code == 422 and response.json()["detail"] == NOT_ASSIGNABLE


@pytest.mark.parametrize("who", [0, 1])
def test_calendar_update_refuses_a_pending_or_inactive_assignee(client, office, team, auth_headers, who):
    headers = auth_headers(office.admin_a)
    event = client.post("/calendar/events", json=_event_body(), headers=headers).json()

    response = client.patch(f"/calendar/events/{event['id']}", json={"assignee_id": team[who].id}, headers=headers)
    assert response.status_code == 422 and response.json()["detail"] == NOT_ASSIGNABLE


def test_an_event_of_a_deactivated_assignee_can_still_be_edited(client, db_session, office, team, auth_headers):
    headers = auth_headers(office.admin_a)
    inactive = team[1]
    event = CalendarEvent(law_firm_id=office.firm_a.id, title="Eski", event_type=CalendarEventType.MEETING,
                          starts_at=datetime(2026, 1, 5, 10, 0), assignee_id=inactive.id,
                          created_by=office.admin_a.id, reminder_days=[])
    db_session.add(event)
    db_session.commit()

    response = client.patch(f"/calendar/events/{event.id}", json={"title": "Yeni", "assignee_id": inactive.id},
                            headers=headers)
    assert response.status_code == 200 and response.json()["title"] == "Yeni"


def test_calendar_assignee_of_another_firm_is_still_404(client, office, auth_headers):
    response = client.post("/calendar/events", json=_event_body(assignee_id=office.lawyer_b.id),
                           headers=auth_headers(office.admin_a))
    assert response.status_code == 404
