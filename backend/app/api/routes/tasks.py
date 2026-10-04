"""Task endpoints (Phase 4 - real Gorevler entity).

Two routers, same pattern as documents.py: case-scoped CRUD under
/cases/{case_id}/tasks, and a firm-wide (cross-case) list + update
under /tasks for the sidebar's global "Gorevler" page.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.task import TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate, TaskWithCaseOut
from app.services.case_service import CaseService
from app.services.task_service import AssigneeNotFound, TaskService

cases_router = APIRouter(prefix="/cases", tags=["tasks"])
tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_owned_case_or_404(db: Session, case_id: str, law_firm_id: str):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


@cases_router.post("/{case_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    case_id: str,
    payload: TaskCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    try:
        return TaskService(db).create_task(case, payload, created_by=current_user.id)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


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
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    service = TaskService(db)
    task = service.get(task_id, law_firm_id)
    if task is None or task.case_id != case_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    try:
        return service.update_task(task, payload)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)


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
    db: Session = Depends(get_db),
):
    """Firm-wide task update (used by the calendar for status and reminder_days)."""
    service = TaskService(db)
    task = service.get(task_id, law_firm_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı")
    try:
        return service.update_task(task, payload)
    except AssigneeNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
