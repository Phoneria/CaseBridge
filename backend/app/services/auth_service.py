import secrets
from typing import Optional

from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, password_epoch, verify_password
from app.models.user import User
from app.repositories.user_repository import UserRepository

# A bcrypt digest (default cost) of a random string nobody knows. Checked
# when the account cannot sign in, so an unknown, inactive or invited address
# costs as much time as a wrong password and timing reveals nothing.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def authenticate(self, email: str, password: str) -> Optional[User]:
        user = self.users.get_by_email(email)
        # Invited users have no password yet (password_set_at is NULL): their
        # placeholder hash must never be usable, whatever is typed.
        if user is None or not user.is_active or user.password_set_at is None:
            verify_password(password, DUMMY_PASSWORD_HASH)
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def issue_token_for(self, user: User) -> str:
        """"pwd" ties the token to the current password: see get_current_user."""
        if user.password_set_at is None:
            raise ValueError("A user without a password cannot get a token")
        return create_access_token(
            subject=user.id,
            extra_claims={
                "law_firm_id": user.law_firm_id,
                "role": user.role.value,
                "pwd": password_epoch(user.password_set_at),
            },
        )
