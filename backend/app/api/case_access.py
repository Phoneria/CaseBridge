"""Who may change a case, and the archived read-only rule.

Every route that writes to a case, or to something that belongs to a case,
runs the firm-scoped lookup first (another firm's case is a 404 before any of
this) and then:

    require_case_manager(user, case)   403 unless admin or the responsible lawyer
    require_case_writable(case)        409 when the case is archived

The order matters: a stranger gets the 403 even when the state would be a 409.
"""
from fastapi import HTTPException, status

from app.models.case import Case
from app.models.user import User, UserRole

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


def require_case_writable(case: Case) -> None:
    if case.is_archived:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CASE_ARCHIVED)
