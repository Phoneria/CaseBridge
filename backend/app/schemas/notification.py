"""Schemas for e-mail notification endpoints."""
from typing import Literal

from pydantic import BaseModel


class NotificationStatusOut(BaseModel):
    email_backend: Literal["console", "smtp"]
    reminders_enabled: bool
    reminder_send_hour: int
    timezone: str


class EmailTestOut(BaseModel):
    sent: bool
    backend: Literal["console", "smtp"]
