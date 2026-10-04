from typing import Optional

from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, task: Task) -> Task:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def save(self, task: Task) -> Task:
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Task]:
        return (
            self.db.query(Task)
            .filter(Task.case_id == case_id, Task.law_firm_id == law_firm_id)
            .order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.asc())
            .all()
        )

    def list_for_firm(self, law_firm_id: str, status: Optional[TaskStatus] = None) -> list[Task]:
        query = self.db.query(Task).filter(Task.law_firm_id == law_firm_id)
        if status is not None:
            query = query.filter(Task.status == status)
        return query.order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.asc()).all()

    def get_by_id_in_firm(self, task_id: str, law_firm_id: str) -> Optional[Task]:
        return self.db.query(Task).filter(Task.id == task_id, Task.law_firm_id == law_firm_id).first()

    def list_for_firm_with_case(
        self, law_firm_id: str, status: Optional[TaskStatus] = None
    ) -> list[tuple[Task, str, str]]:
        """Global (cross-case) task list for the firm-wide 'Gorevler' page -
        joins Case so the UI can show which case each task belongs to
        without an N+1 lookup per row."""
        from app.models.case import Case

        query = (
            self.db.query(Task, Case.case_name, Case.case_number)
            .join(Case, Task.case_id == Case.id)
            .filter(Task.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
        )
        if status is not None:
            query = query.filter(Task.status == status)
        return query.order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.asc()).all()

    def list_pending_titles_for_case(self, case_id: str, law_firm_id: str) -> list[str]:
        pending = (
            self.db.query(Task)
            .filter(Task.case_id == case_id, Task.law_firm_id == law_firm_id, Task.status == TaskStatus.PENDING)
            .order_by(Task.due_date.is_(None), Task.due_date.asc())
            .all()
        )
        return [t.title for t in pending]
