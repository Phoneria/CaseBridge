"""Who can be given work (a case, a task, a calendar event): an active user of
the same firm who has chosen a password. Invitees and deactivated users are
refused; a user of another firm does not exist (the caller answers 404)."""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories.user_repository import UserRepository

NOT_ASSIGNABLE = "Seçilen kullanıcı atanamaz."


class AssigneeNotAssignable(Exception):
    """The user is in the firm but cannot take work (422)."""

    detail = NOT_ASSIGNABLE


def is_assignable(user: User) -> bool:
    return bool(user.is_active) and user.password_set_at is not None


def find_assignable_in_firm(db: Session, user_id: str, law_firm_id: str) -> Optional[User]:
    """The user, None when not in the firm, AssigneeNotAssignable when the
    user is pending or inactive."""
    user = UserRepository(db).get_by_id_in_firm(user_id, law_firm_id)
    if user is None:
        return None
    if not is_assignable(user):
        raise AssigneeNotAssignable()
    from app.models.management import WorkspaceAccess
    if db.query(WorkspaceAccess).filter(WorkspaceAccess.user_id == user.id, WorkspaceAccess.law_firm_id == law_firm_id, WorkspaceAccess.position == "client").first():
        raise AssigneeNotAssignable()
    return user


def excluded_task_assignees(db: Session, law_firm_id: str, case_id: str) -> set[str]:
    """Apply the same file scope to the picker and to task writes."""
    from app.db.demo_team import scoped_lawyer_ids, sample_cases
    from app.models.management import WorkspaceAccess

    grants = db.query(WorkspaceAccess).filter_by(law_firm_id=law_firm_id).all()
    excluded = {grant.user_id for grant in grants
                if grant.position in ("accountant", "client") or case_id not in grant.case_ids}
    roster = scoped_lawyer_ids(law_firm_id)
    granted_roster = {g.user_id for g in grants if g.user_id in roster and g.position == "lawyer" and case_id in g.case_ids}
    from app.db.dossier_pack import package_cases
    if granted_roster and any(case.id == case_id for case in sample_cases(db, law_firm_id) + package_cases(db, law_firm_id)):
        return excluded | (roster - granted_roster)
    return excluded | roster
