"""Application-local time (APP_TIMEZONE).

Calendar event times are stored as naive datetimes in this zone, and
"today" for the calendar and reminders is the date in this zone.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def app_zone() -> ZoneInfo:
    return ZoneInfo(settings.app_timezone)


def local_now() -> datetime:
    """Current wall-clock time in APP_TIMEZONE, as a naive datetime."""
    return datetime.now(app_zone()).replace(tzinfo=None)


def local_today() -> date:
    return local_now().date()


def to_local_naive(value: datetime) -> datetime:
    """Aware datetimes are converted to APP_TIMEZONE; naive ones are
    already local and returned unchanged."""
    if value.tzinfo is None:
        return value
    return value.astimezone(app_zone()).replace(tzinfo=None)
