"""Task endpoints (Phase 4 - real Gorevler entity).

Two routers, same pattern as documents.py: case-scoped CRUD under
/cases/{case_id}/tasks, and a firm-wide (cross-case) list + update
under /tasks for the sidebar's global "Gorevler" page.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.case_access import require_case_id_writable, require_case_writable
from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.case import Case
from app.models.task import TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate, TaskWithCaseOut
from app.services.assignees import AssigneeNotAssignable
from app.services.audit import changed_fields, record_audit, snapshot
from app.services.case_service import CaseService
from app.services.task_service import AssigneeNotFound, TaskService

cases_router = APIRouter(prefix="/cases", tags=["tasks"])
tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_owned_case_or_404(db: Session, case_id: str, law_firm_id: str):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _record_task_update(db, actor, task, before) -> None:
    changed = changed_fields(task, before)
    if not changed:
        return
    transitions = {"task_status": (before["status"], task.status)} if "status" in changed else None
    record_audit(db, actor, "task.updated", case=db.get(Case, task.case_id), target_type="task", target_id=task.id,
                 fields=changed, transitions=transitions)


@cases_router.post("/{case_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    case_id: str,
    payload: TaskCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    require_case_writable(case)
    try:
        task = TaskService(db).create_task(case, payload, created_by=current_user.id)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
    except AssigneeNotAssignable as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)
    record_audit(db, current_user, "task.created", case=case, target_type="task", target_id=task.id,
                 transitions={"task_status": (None, task.status)})
    return task


@cases_router.get("/{case_id}/tasks", response_model=list[TaskOut])
def list_case_tasks(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    return TaskService(db).list_for_case(case_id, law_firm_id)


@cases_router.patch("/{case_id}/tasks/{task_id}", response_model=TaskOut)
def update_case_task(
    case_id: str,
    task_id: str,
    payload: TaskUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    service = TaskService(db)
    task = service.get(task_id, law_firm_id)
    if task is None or task.case_id != case_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    require_case_writable(case)
    before = snapshot(task, sorted(payload.model_fields_set | {"status"}))
    try:
        updated = service.update_task(task, payload)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
    except AssigneeNotAssignable as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)
    _record_task_update(db, current_user, updated, before)
    return updated


@tasks_router.get("", response_model=list[TaskWithCaseOut])
def list_all_tasks(
    status_filter: Optional[TaskStatus] = Query(default=None, alias="status"),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    rows = TaskService(db).list_for_firm_with_case(law_firm_id, status=status_filter)
    return [
        TaskWithCaseOut(
            **TaskOut.model_validate(task, from_attributes=True).model_dump(),
            case_name=case_name,
            case_number=case_number,
        )
        for task, case_name, case_number in rows
    ]


@tasks_router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Firm-wide task update (used by the calendar for status and reminder_days)."""
    service = TaskService(db)
    task = service.get(task_id, law_firm_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı")
    require_case_id_writable(db, task.case_id, law_firm_id)
    before = snapshot(task, sorted(payload.model_fields_set | {"status"}))
    try:
        updated = service.update_task(task, payload)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
    except AssigneeNotAssignable as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)
    _record_task_update(db, current_user, updated, before)
    return updated
