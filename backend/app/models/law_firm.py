import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LawFirm(Base):
    __tablename__ = "law_firms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    # False = suspended by the CaseBridge team: none of the firm's users can
    # sign in or use a session or link; the data stays.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The internal firm of the CaseBridge team's platform administrators. Never
    # listed in the platform panel and never suspended.
    is_platform: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="law_firm")
