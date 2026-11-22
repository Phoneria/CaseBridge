import enum
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"


class TaskStage(str, enum.Enum):
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"


class TaskPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(str_enum(TaskStatus), default=TaskStatus.PENDING, nullable=False)

    open_stage: Mapped[str] = mapped_column(String(16), server_default="todo", nullable=False)
    priority: Mapped[str] = mapped_column(String(12), server_default="normal", nullable=False)

    @property
    def stage(self) -> TaskStage:
        return TaskStage.DONE if self.status == TaskStatus.COMPLETED else TaskStage(self.open_stage)

    assigned_to: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    assignee = relationship("User", foreign_keys=[assigned_to], lazy="selectin", viewonly=True)

    @property
    def assignee_name(self) -> str | None:
        return self.assignee.full_name if self.assignee else None

    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    #: Days before due_date to send an e-mail reminder; NULL -> default [1], [] -> none.
    reminder_days: Mapped[Optional[list[int]]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
