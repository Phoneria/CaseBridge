"""Every write endpoint either records an audit action or is listed as not audited."""
from fastapi.routing import APIRoute

from app.main import app
from app.services.audit import ACTIONS

AUDITED = {
    ("POST", "/cases"): "case.created",
    ("PATCH", "/cases/{case_id}"): "case.updated",
    ("POST", "/cases/{case_id}/close"): "case.closed",
    ("POST", "/cases/{case_id}/reopen"): "case.reopened",
    ("POST", "/cases/{case_id}/archive"): "case.archived",
    ("POST", "/cases/{case_id}/unarchive"): "case.unarchived",
    ("POST", "/cases/{case_id}/handover"): "case.handover_created",
    ("PATCH", "/admin/cases/{case_id}/lawyer"): "case.lawyer_changed",
    ("POST", "/cases/{case_id}/events"): "case_event.created",
    ("PATCH", "/cases/{case_id}/events/{event_id}"): "case_event.updated",
    ("DELETE", "/cases/{case_id}/events/{event_id}"): "case_event.deleted",
    ("POST", "/cases/{case_id}/documents"): "document.uploaded",
    ("DELETE", "/documents/{document_id}"): "document.deleted",
    ("POST", "/cases/{case_id}/tasks"): "task.created",
    ("PATCH", "/cases/{case_id}/tasks/{task_id}"): "task.updated",
    ("PATCH", "/tasks/{task_id}"): "task.updated",
    ("POST", "/calendar/events"): "calendar_event.created",
    ("PATCH", "/calendar/events/{event_id}"): "calendar_event.updated",
    ("DELETE", "/calendar/events/{event_id}"): "calendar_event.deleted",
    ("POST", "/calendar/events/{event_id}/result"): "hearing.result_recorded",
    ("POST", "/clients"): "client.created",
    ("PATCH", "/clients/{client_id}"): "client.updated",
    ("DELETE", "/clients/{client_id}"): "client.deleted",
    ("POST", "/case-intake/extract"): "ai.case_intake",
    ("POST", "/cases/{case_id}/simulations"): "ai.analysis_started",
    ("POST", "/cases/{case_id}/simulations/{simulation_id}/retry"): "ai.analysis_retried",
    ("POST", "/courtroom-sessions"): "ai.courtroom_started",
    ("POST", "/courtroom-sessions/from-case"): "ai.courtroom_started",
    ("POST", "/courtroom-sessions/{session_id}/moves"): "ai.courtroom_move",
    ("POST", "/courtroom-sessions/{session_id}/retry"): "ai.courtroom_move",
    ("POST", "/courtroom-sessions/{session_id}/finish"): "ai.courtroom_finished",
    ("POST", "/courtroom-sessions/{session_id}/abandon"): "ai.courtroom_abandoned",
    ("POST", "/chat/conversations/{conversation_id}/messages"): "ai.chat_message",
    ("PUT", "/chat/messages/{message_id}/feedback"): "ai.chat_feedback",
}

NOT_AUDITED = {
    ("POST", "/auth/login"), ("POST", "/auth/logout"), ("POST", "/auth/change-password"),
    ("POST", "/auth/forgot-password"), ("POST", "/auth/set-password"), ("PATCH", "/users/me"),
    ("POST", "/admin/users"), ("PATCH", "/admin/users/{user_id}"), ("POST", "/admin/users/{user_id}/activate"),
    ("POST", "/admin/users/{user_id}/deactivate"), ("POST", "/admin/users/{user_id}/invite"),
    ("POST", "/admin/users/{user_id}/password-reset"), ("POST", "/admin/demo-template"),
    ("PATCH", "/admin/precedents/{precedent_id}/reviewer"),
    ("POST", "/platform/firms"), ("POST", "/platform/firms/{firm_id}/activate"),
    ("POST", "/platform/firms/{firm_id}/admins"), ("POST", "/platform/firms/{firm_id}/admins/{user_id}/invite"),
    ("POST", "/platform/firms/{firm_id}/suspend"),
    ("POST", "/courtroom-sessions/{session_id}/voice/transcribe"),
    ("POST", "/chat/conversations"), ("PATCH", "/chat/conversations/{conversation_id}"),
    ("DELETE", "/chat/conversations/{conversation_id}"),
    ("POST", "/notifications/test-email"), ("POST", "/system/openai-key/activate"), ("PUT", "/system/openai-key"),
}

# Routes that can record a second action besides the one in AUDITED.
ALSO_RECORDED = {
    ("PATCH", "/cases/{case_id}"): "case.parties_changed",
}

WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


def _write_routes() -> set[tuple[str, str]]:
    return {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
        if method in WRITE_METHODS
    }


def test_every_write_route_is_audited_or_explicitly_not():
    routes = _write_routes()
    unmapped = routes - set(AUDITED) - NOT_AUDITED
    assert not unmapped, f"Add these routes to AUDITED (and record_audit) or to NOT_AUDITED: {sorted(unmapped)}"
    assert not (set(AUDITED) | NOT_AUDITED) - routes, "Stale entries: these routes no longer exist"
    assert not set(AUDITED) & NOT_AUDITED


def test_every_mapped_action_exists_and_every_action_is_used():
    assert set(ALSO_RECORDED) <= set(AUDITED)
    assert set(AUDITED.values()) | set(ALSO_RECORDED.values()) == set(ACTIONS)
