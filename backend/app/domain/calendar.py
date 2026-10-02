"""Calendar rules shared by the API and the reminder service: reminder
defaults, the allowed reminder range and Turkish type labels."""
from typing import Optional

MAX_REMINDER_DAYS = 30
HEARING_REMINDER_DAYS = [3, 1]
EVENT_REMINDER_DAYS = [1]
TASK_REMINDER_DAYS = [1]

TYPE_LABELS = {
    "hearing": "Duruşma",
    "meeting": "Toplantı",
    "client_meeting": "Müvekkil görüşmesi",
    "other": "Diğer",
    "task": "Görev",
}


def normalize_reminder_days(values: list[int]) -> list[int]:
    """Each value 0-30; duplicates removed; largest first."""
    for value in values:
        if value < 0 or value > MAX_REMINDER_DAYS:
            raise ValueError("Hatırlatma günleri 0 ile 30 arasında olmalıdır.")
    return sorted(set(values), reverse=True)


def default_event_reminder_days(event_type: str) -> list[int]:
    return list(HEARING_REMINDER_DAYS if event_type == "hearing" else EVENT_REMINDER_DAYS)


def task_reminder_days(stored: Optional[list[int]]) -> list[int]:
    """A task without its own choice (NULL) uses the default [1]."""
    return list(TASK_REMINDER_DAYS) if stored is None else list(stored)
