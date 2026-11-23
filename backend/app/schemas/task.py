from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.task import TaskPriority, TaskStage, TaskStatus
from app.schemas.calendar import EventTitle, ReminderDays


class TaskCreate(BaseModel):
    stage: TaskStage = TaskStage.TODO
    priority: TaskPriority = TaskPriority.NORMAL
    title: EventTitle
    description: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to: Optional[str] = None
    #: Omitted/null -> default [1]; [] -> no reminders.
    reminder_days: Optional[ReminderDays] = None


_REQUIRED_ON_UPDATE = ("title", "status", "stage", "priority")


class TaskUpdate(BaseModel):
    stage: Optional[TaskStage] = None
    priority: Optional[TaskPriority] = None
    title: Optional[EventTitle] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to: Optional[str] = None
    status: Optional[TaskStatus] = None
    #: null -> default [1]; [] -> no reminders.
    reminder_days: Optional[ReminderDays] = None

    @model_validator(mode="after")
    def required_fields_are_not_null(self):
        for field in _REQUIRED_ON_UPDATE:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} boş olamaz.")
        if self.stage and self.status and (self.stage == TaskStage.DONE) != (self.status == TaskStatus.COMPLETED):
            raise ValueError("Aşama ve tamamlanma durumu uyuşmuyor.")
        return self


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stage: TaskStage
    priority: TaskPriority
    id: str
    case_id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    status: TaskStatus
    assigned_to: Optional[str] = None
    assignee_name: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    reminder_days: Optional[list[int]] = None


class TaskWithCaseOut(TaskOut):
    case_name: str
    case_number: str
