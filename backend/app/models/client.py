import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ClientType(str, enum.Enum):
    PERSON = "person"
    COMPANY = "company"


class Client(Base):
    """A client of one firm. Client parties of the firm's cases point here
    (case_parties.client_id); the party name is a copy of `name`."""

    __tablename__ = "clients"
    # Not unique: two different people may share a name.
    __table_args__ = (Index("ix_clients_law_firm_id_name_key", "law_firm_id", "name_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # client_name_key(name); kept in step with name by ClientService.
    name_key: Mapped[str] = mapped_column(String(255), nullable=False)
    # ClientType value, validated by the API, stored as plain text.
    client_type: Mapped[str] = mapped_column(String(20), nullable=False, default=ClientType.PERSON.value)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
