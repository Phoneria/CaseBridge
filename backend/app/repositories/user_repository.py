"""User data access.

Every read here is scoped by law_firm_id where relevant, so a caller
can never fetch a row belonging to a different tenant just by knowing
its id. This is the pattern later Case/Document repositories follow.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_id_in_firm(self, user_id: str, law_firm_id: str) -> Optional[User]:
        return (
            self.db.query(User)
            .filter(User.id == user_id, User.law_firm_id == law_firm_id)
            .first()
        )

    def list_in_firm(self, law_firm_id: str) -> list[User]:
        return self.db.query(User).filter(User.law_firm_id == law_firm_id).all()
