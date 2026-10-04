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
    """One row of GET /calendar: a calendar event, a pending task's due date
    or a case's next hearing. The legacy fields (date, title, case_id,
    case_name, task_id, event_type "hearing"/"task") keep their meaning."""

    id: str  # "event:<id>", "task:<id>" or "hearing:<case_id>"
    kind: Literal["event", "task", "case_hearing"]
    event_type: Literal["hearing", "meeting", "client_meeting", "other", "task"]
    title: str
    date: date
    start: Optional[datetime] = None  # only for timed events
    end: Optional[datetime] = None
    all_day: bool
    case_id: Optional[str] = None
    case_name: Optional[str] = None
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    reminder_days: list[int]
    editable: bool


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
