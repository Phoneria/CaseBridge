"""User data access.

Every read here is scoped by law_firm_id where relevant, so a caller
can never fetch a row belonging to a different tenant just by knowing
its id. This is the pattern later Case/Document repositories follow.
"""
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        """Case-insensitive: e-mail addresses are stored lower-case, but older
        rows may not be."""
        return self.db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()

    def get_by_id_in_firm(self, user_id: str, law_firm_id: str) -> Optional[User]:
        return (
            self.db.query(User)
            .filter(User.id == user_id, User.law_firm_id == law_firm_id)
            .first()
        )

    def list_in_firm(self, law_firm_id: str) -> list[User]:
        """Active users who have chosen a password."""
        return (
            self.db.query(User)
            .filter(
                User.law_firm_id == law_firm_id,
                User.is_active.is_(True),
                User.password_set_at.isnot(None),
            )
            .all()
        )
