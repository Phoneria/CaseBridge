"""Input rules for case timeline entries (Gelişmeler) and notes (Notlar).

A note is a timeline entry of type `note`: its text lives in `description` and
its `title` is derived from the text's first line, so lists that only show
titles (quick view, dashboard activity) still read well. The rules raise
CaseEventInputError with a Turkish sentence; routes turn it into a 422 with a
string detail (the frontend shows only string details).
"""
from typing import Optional

from app.models.case import CaseEventType
from app.schemas.case import CaseEventCreate

NOTE_MAX_LENGTH = 4000
DESCRIPTION_MAX_LENGTH = 4000
TITLE_MAX_LENGTH = 255
NOTE_TITLE_LENGTH = 120


class CaseEventInputError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def note_title(text: str) -> str:
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    collapsed = " ".join(first_line.split())
    if len(collapsed) <= NOTE_TITLE_LENGTH:
        return collapsed
    return collapsed[: NOTE_TITLE_LENGTH - 1].rstrip() + "…"


def clean_note_text(value: Optional[str]) -> str:
    text = (value or "").strip()
    if not text:
        raise CaseEventInputError("Not metni boş olamaz.")
    if len(text) > NOTE_MAX_LENGTH:
        raise CaseEventInputError("Not en fazla 4000 karakter olabilir.")
    return text


def clean_event_fields(payload: CaseEventCreate) -> dict:
    if payload.event_type == CaseEventType.NOTE:
        text = clean_note_text(payload.description)
        return {"event_date": payload.event_date, "title": note_title(text), "description": text, "event_type": payload.event_type}

    title = (payload.title or "").strip()
    if not title:
        raise CaseEventInputError("Gelişme başlığı boş olamaz.")
    if len(title) > TITLE_MAX_LENGTH:
        raise CaseEventInputError("Gelişme başlığı en fazla 255 karakter olabilir.")
    description = (payload.description or "").strip() or None
    if description is not None and len(description) > DESCRIPTION_MAX_LENGTH:
        raise CaseEventInputError("Açıklama en fazla 4000 karakter olabilir.")
    return {"event_date": payload.event_date, "title": title, "description": description, "event_type": payload.event_type}
