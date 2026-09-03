from typing import Optional

from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.repositories.user_repository import UserRepository


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self.users.get_by_email(email)
        if user is None or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def issue_token_for(self, user: User) -> str:
        return create_access_token(
            subject=user.id,
            extra_claims={"law_firm_id": user.law_firm_id, "role": user.role.value},
        )
