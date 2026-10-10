import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timeutil import utc_now
from app.db.base import Base
from app.db.types import str_enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    LAWYER = "lawyer"


class UserStatus(str, enum.Enum):
    """Derived display status; never stored."""

    PENDING = "pending"
    ACTIVE = "active"
    INACTIVE = "inactive"


def _password_set_now() -> datetime:
    # Whole seconds: the JWT "pwd" claim carries this value as integer seconds.
    return utc_now().replace(microsecond=0)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    role: Mapped[UserRole] = mapped_column(str_enum(UserRole), default=UserRole.LAWYER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # When the password was last set (UTC, whole seconds). NULL = never set:
    # the user was invited and has not chosen a password yet. A new User that
    # is built without this value counts as "password set now"; an invited
    # user is created with password_set_at=sqlalchemy.null(), because the ORM
    # applies the default to a plain None.
    password_set_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=_password_set_now
    )
    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    law_firm: Mapped["LawFirm"] = relationship(back_populates="users")

    @property
    def status(self) -> UserStatus:
        if not self.is_active:
            return UserStatus.INACTIVE
        if self.password_set_at is None:
            return UserStatus.PENDING
        return UserStatus.ACTIVE
