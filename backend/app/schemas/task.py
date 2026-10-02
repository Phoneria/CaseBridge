from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.task import TaskStatus
from app.schemas.calendar import ReminderDays


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to: Optional[str] = None
    status: Optional[TaskStatus] = None
    #: null -> default [1]; [] -> no reminders.
    reminder_days: Optional[ReminderDays] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    status: TaskStatus
    assigned_to: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    reminder_days: Optional[list[int]] = None


class TaskWithCaseOut(TaskOut):
    case_name: str
    case_number: str
