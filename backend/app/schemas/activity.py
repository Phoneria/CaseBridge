from datetime import date, datetime

from pydantic import BaseModel


class ActivityItemOut(BaseModel):
    id: str
    case_id: str
    case_name: str
    title: str
    event_type: str
    event_date: date
    created_at: datetime
