"""Task service (Phase 4 - real Gorevler entity, replacing the
previously-empty pending_tasks placeholder in the handover report and
the case detail "Gorevler" tab's ComingSoon-style empty state).
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.task import Task, TaskStatus
from app.repositories.task_repository import TaskRepository
from app.repositories.user_repository import UserRepository
from app.schemas.task import TaskCreate, TaskUpdate


class AssigneeNotFound(Exception):
    """The assignee is not a user of the caller's firm."""

    detail = "Kullanıcı bulunamadı"


class TaskService:
    def __init__(self, db: Session):
        self.db = db
        self.tasks = TaskRepository(db)

    def _check_assignee(self, assigned_to: Optional[str], law_firm_id: str) -> None:
        if assigned_to is not None and UserRepository(self.db).get_by_id_in_firm(assigned_to, law_firm_id) is None:
            raise AssigneeNotFound()

    def create_task(self, case: Case, payload: TaskCreate, created_by: Optional[str]) -> Task:
        self._check_assignee(payload.assigned_to, case.law_firm_id)
        task = Task(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            created_by=created_by,
            **payload.model_dump(exclude_unset=True),
        )
        return self.tasks.create(task)

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Task]:
        return self.tasks.list_for_case(case_id, law_firm_id)

    def get(self, task_id: str, law_firm_id: str) -> Optional[Task]:
        return self.tasks.get_by_id_in_firm(task_id, law_firm_id)

    def update_task(self, task: Task, payload: TaskUpdate) -> Task:
        updates = payload.model_dump(exclude_unset=True)
        self._check_assignee(updates.get("assigned_to"), task.law_firm_id)
        was_pending = task.status == TaskStatus.PENDING
        for field, value in updates.items():
            setattr(task, field, value)
        if "status" in updates:
            if task.status == TaskStatus.COMPLETED and was_pending:
                task.completed_at = datetime.now(timezone.utc)
            elif task.status == TaskStatus.PENDING:
                task.completed_at = None
        return self.tasks.save(task)

    def list_for_firm(self, law_firm_id: str, status: Optional[TaskStatus] = None) -> list[Task]:
        return self.tasks.list_for_firm(law_firm_id, status=status)

    def list_for_firm_with_case(
        self, law_firm_id: str, status: Optional[TaskStatus] = None
    ) -> list[tuple[Task, str, str]]:
        return self.tasks.list_for_firm_with_case(law_firm_id, status=status)

    def list_pending_titles_for_case(self, case_id: str, law_firm_id: str) -> list[str]:
        return self.tasks.list_pending_titles_for_case(case_id, law_firm_id)
