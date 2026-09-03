"""Schema for the firm-wide calendar (Phase 4 - Takvim)."""
from datetime import date
from typing import Literal

from pydantic import BaseModel


class CalendarEventOut(BaseModel):
    event_type: Literal["hearing", "task"]
    date: date
    title: str
    case_id: str
    case_name: str
