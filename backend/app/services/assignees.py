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
    return user
