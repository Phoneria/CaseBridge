"""Who may change a case, and the archived read-only rule.

Every route that writes to a case, or to something that belongs to a case,
runs the firm-scoped lookup first (another firm's case is a 404 before any of
this) and then:

    require_case_manager(user, case)   403 unless admin or the responsible lawyer
    require_case_writable(case)        409 when the case is archived

The order matters: a stranger gets the 403 even when the state would be a 409.
Routes that only know a child row (a task, a document, a calendar event) use
require_case_id_writable.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent
from app.models.user import User, UserRole
from app.repositories.case_repository import CaseRepository

NOT_CASE_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
CASE_ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."


def can_manage_case(user: User, case: Case) -> bool:
    """Admins manage every case of the firm; a lawyer only the cases they are
    responsible for. A case without a responsible lawyer belongs to the admins."""
    if user.role == UserRole.ADMIN:
        return True
    return case.assigned_lawyer_id is not None and case.assigned_lawyer_id == user.id


def require_case_manager(user: User, case: Case) -> None:
    if not can_manage_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_CASE_MANAGER)


NOT_NOTE_CHANGER = "Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir."


def can_change_note(user: User, case: Case, event: CaseEvent) -> bool:
    """A note may be changed by whoever wrote it, by the case's responsible lawyer and by admins."""
    return (event.created_by is not None and event.created_by == user.id) or can_manage_case(user, case)


def require_case_writable(case: Case) -> None:
    if case.is_archived:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CASE_ARCHIVED)


def require_case_id_writable(db: Session, case_id: Optional[str], law_firm_id: str) -> None:
    """For endpoints that reach a case through one of its children. No case, or
    a case of another firm, is not this helper's business: the endpoint answers
    404 for it as it did before."""
    if case_id is None:
        return
    case = CaseRepository(db).get_by_id_in_firm(case_id, law_firm_id)
    if case is not None:
        require_case_writable(case)
