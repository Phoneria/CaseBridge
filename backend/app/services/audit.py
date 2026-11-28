"""Process analytics: who did what, when, in which case
(docs/superpowers/specs/2026-11-17-audit-log-design.md).

record_audit() is the only writer. It accepts no free text: field names,
enum or uuid transitions, integer counts and flags from fixed value sets.
Routes call it after their action has committed; a database error while
writing the audit row is logged and swallowed so it never undoes the
user's action. Anything outside the allow-lists raises AuditDetailError:
that is a programmer error and must surface in tests."""
import logging
import re
from enum import Enum
from typing import Iterable, Mapping, Optional, get_args

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.case import Case
from app.models.user import User
from app.schemas.calendar import CalendarEventUpdate
from app.schemas.case import CaseNoteUpdate, CaseUpdate
from app.schemas.client import ClientUpdate
from app.schemas.management import Kind
from app.schemas.task import TaskUpdate

logger = logging.getLogger("casebridge")

ACTIONS = frozenset({
    "case.created", "case.updated", "case.lawyer_changed", "case.parties_changed", "case.closed",
    "case.reopened", "case.archived", "case.unarchived", "case.handover_created", "case.decision_recorded",
    "case.precedent_linked", "case.precedent_unlinked",
    "case_event.created", "case_event.updated", "case_event.deleted",
    "document.uploaded", "document.deleted",
    "task.created", "task.updated",
    "calendar_event.created", "calendar_event.updated", "calendar_event.deleted",
    "hearing.result_recorded",
    "client.created", "client.updated", "client.deleted",
    "ai.case_intake", "ai.analysis_started", "ai.analysis_retried",
    "ai.courtroom_started", "ai.courtroom_move", "ai.courtroom_finished", "ai.courtroom_abandoned",
    "ai.chat_message", "ai.chat_feedback",
    "ai.counter_analysis", "ai.trial_beat", "ai.trial_guide", "ai.trial_ask", "ai.sufle_analysis",
    "record.created", "record.updated", "record.trashed", "record.restored",
})
# Field names are not content; every editable field of the audited update schemas is allowed.
AUDITED_FIELDS = frozenset(
    name
    for model in (CaseUpdate, CaseNoteUpdate, TaskUpdate, CalendarEventUpdate, ClientUpdate)
    for name in model.model_fields
) - {"parties"}
TRANSITION_FIELDS = frozenset({
    "status", "outcome", "case_type", "assigned_lawyer_id", "client_role", "event_type", "task_status",
})
COUNT_NAMES = frozenset({"parties", "clients", "open_days", "size_kb", "filled_fields", "moves", "duration_min"})
FLAG_VALUES: dict[str, frozenset[str]] = {
    "source": frozenset({"form", "ai_intake", "client_page", "text", "file", "scenario", "case"}),
    "file_kind": frozenset({"pdf", "docx", "txt", "other"}),
    "text_extracted": frozenset({"yes", "no"}),
    "linked_to_case": frozenset({"yes", "no"}),
    "client_type": frozenset({"person", "company"}),
    "feedback": frozenset({"up", "down", "cleared"}),
    "level": frozenset({"basic", "standard", "deep"}),
    "mode": frozenset({"live", "summary"}),
    "record_kind": frozenset(get_args(Kind)),
}
TARGET_TYPES = frozenset({
    "event", "document", "task", "calendar_event", "client", "courtroom_session", "simulation", "chat_conversation",
    "precedent", "record",
})
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class AuditDetailError(ValueError):
    """A caller tried to record something outside the allow-lists."""


def _transition_value(value):
    if value is None:
        return None
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, str) and _UUID.match(value):
        return value
    raise AuditDetailError("transition values must be enum members, uuids or None")


def build_details(fields: Iterable[str] = (), transitions=None, counts=None, flags=None) -> dict:
    details: dict = {}
    names = sorted(set(fields))
    if any(name not in AUDITED_FIELDS for name in names):
        raise AuditDetailError("unknown audited field name")
    if names:
        details["fields"] = names
    if transitions:
        out = {}
        for name in sorted(transitions):
            if name not in TRANSITION_FIELDS:
                raise AuditDetailError("unknown transition field")
            old, new = transitions[name]
            out[name] = [_transition_value(old), _transition_value(new)]
        details["transitions"] = out
    if counts:
        for name, value in counts.items():
            if name not in COUNT_NAMES or isinstance(value, bool) or not isinstance(value, int):
                raise AuditDetailError("counts must be known names with int values")
        details["counts"] = dict(sorted(counts.items()))
    if flags:
        for name, value in flags.items():
            if value not in FLAG_VALUES.get(name, ()):
                raise AuditDetailError("flags must be known names with known values")
        details["flags"] = dict(sorted(flags.items()))
    return details


def snapshot(obj, names: Iterable[str]) -> dict:
    """The current values of `names` on `obj`, to compare after a change."""
    return {name: getattr(obj, name) for name in names}


def changed_fields(obj, before: Mapping[str, object]) -> list[str]:
    return sorted(name for name, value in before.items() if getattr(obj, name) != value)


def record_audit(
    db: Session,
    actor: Optional[User],
    action: str,
    *,
    law_firm_id: Optional[str] = None,
    case: Optional[Case] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    fields: Iterable[str] = (),
    transitions=None,
    counts=None,
    flags=None,
) -> Optional[AuditEvent]:
    if action not in ACTIONS:
        raise AuditDetailError(f"unknown audit action: {action}")
    if target_type is not None and target_type not in TARGET_TYPES:
        raise AuditDetailError("unknown target type")
    details = build_details(fields, transitions, counts, flags)
    firm_id = law_firm_id or (case.law_firm_id if case is not None else None) or (
        actor.law_firm_id if actor is not None else None
    )
    if firm_id is None:
        raise AuditDetailError("an audit row needs a firm")
    row = AuditEvent(
        law_firm_id=firm_id,
        actor_user_id=actor.id if actor is not None else None,
        actor_role=actor.role.value if actor is not None else None,
        action=action,
        case_id=case.id if case is not None else None,
        case_type=case.case_type.value if case is not None and case.case_type is not None else None,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    try:
        db.add(row)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Hareket kaydı yazılamadı: işlem=%s büro=%s", action, firm_id)
        return None
    return row
