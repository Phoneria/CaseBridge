"""Schemas for the firm-wide calendar: list items and calendar events."""
from datetime import date, datetime
from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.domain.calendar import normalize_reminder_days
from app.models.calendar import CalendarEventType

#: 0-30 each, duplicates removed, largest first.
ReminderDays = Annotated[list[int], AfterValidator(normalize_reminder_days)]
EventTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DurationMinutes = Annotated[int, Field(ge=5, le=1440)]
ShortText = Annotated[str, StringConstraints(max_length=200)]
NotesText = Annotated[str, StringConstraints(max_length=5000)]


class CalendarItemOut(BaseModel):
    event_type: Literal["hearing", "task"]
    date: date
    title: str
    case_id: str
    case_name: str
    task_id: Optional[str] = None


class CalendarEventCreate(BaseModel):
    title: EventTitle
    event_type: CalendarEventType = CalendarEventType.OTHER
    starts_at: datetime
    all_day: bool = False
    duration_minutes: DurationMinutes = 60
    location: Optional[ShortText] = None
    notes: Optional[NotesText] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    #: Omitted -> default for the type (hearing [3, 1], others [1]); [] -> no reminders.
    reminder_days: Optional[ReminderDays] = None


_REQUIRED_ON_UPDATE = ("title", "event_type", "starts_at", "all_day", "duration_minutes", "reminder_days")


class CalendarEventUpdate(BaseModel):
    title: Optional[EventTitle] = None
    event_type: Optional[CalendarEventType] = None
    starts_at: Optional[datetime] = None
    all_day: Optional[bool] = None
    duration_minutes: Optional[DurationMinutes] = None
    location: Optional[ShortText] = None
    notes: Optional[NotesText] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    reminder_days: Optional[ReminderDays] = None

    @model_validator(mode="after")
    def required_fields_are_not_null(self):
        for field in _REQUIRED_ON_UPDATE:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} boş olamaz.")
        return self


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    event_type: CalendarEventType
    starts_at: datetime
    all_day: bool
    duration_minutes: int
    location: Optional[str] = None
    notes: Optional[str] = None
    case_id: Optional[str] = None
    assignee_id: Optional[str] = None
    created_by: str
    reminder_days: list[int]
    created_at: datetime
    updated_at: datetime
