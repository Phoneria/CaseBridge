import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class CaseType(str, enum.Enum):
    IS_HUKUKU = "is_hukuku"
    TICARET_HUKUKU = "ticaret_hukuku"
    SOZLESME = "sozlesme"
    KIRA = "kira"
    ICRA = "icra"
    DIGER = "diger"


class CaseStatus(str, enum.Enum):
    DEVAM_EDEN = "devam_eden"
    DURUSMA_BEKLEYEN = "durusma_bekleyen"
    KARAR_BEKLEYEN = "karar_bekleyen"
    KAPALI = "kapali"


class CaseOutcome(str, enum.Enum):
    ONGOING = "ongoing"
    WON = "won"
    LOST = "lost"
    SETTLED = "settled"


class PartyRole(str, enum.Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    INTERVENER = "intervener"
    OTHER = "other"


class ClientRole(str, enum.Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    OTHER = "other"


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (
        UniqueConstraint("law_firm_id", "case_number", name="uq_cases_law_firm_id_case_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    case_number: Mapped[str] = mapped_column(String(50), nullable=False)
    case_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    opposing_party: Mapped[str] = mapped_column(String(255), nullable=True)
    case_type: Mapped[CaseType] = mapped_column(str_enum(CaseType), nullable=False)
    court: Mapped[str] = mapped_column(String(255), nullable=True)
    assigned_lawyer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewer_lawyer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    opening_date: Mapped[date] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    next_hearing_date: Mapped[date] = mapped_column(Date, nullable=True)

    status: Mapped[CaseStatus] = mapped_column(str_enum(CaseStatus), default=CaseStatus.DEVAM_EDEN, nullable=False)
    outcome: Mapped[CaseOutcome] = mapped_column(str_enum(CaseOutcome), default=CaseOutcome.ONGOING, nullable=False)

    case_value: Mapped[float] = mapped_column(Float, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # Case intake: structured description of the dispute. client_role is
    # validated by the API (ClientRole), stored as plain text.
    client_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    court_file_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    claim: Mapped[str | None] = mapped_column(Text, nullable=True)
    facts_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    plaintiff_position: Mapped[str | None] = mapped_column(Text, nullable=True)
    defendant_position: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_precedent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    events: Mapped[list["CaseEvent"]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="CaseEvent.event_date"
    )
    parties: Mapped[list["CaseParty"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="CaseParty.sort_order",
        lazy="selectin",
    )


class CaseParty(Base):
    __tablename__ = "case_parties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_client: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    counsel_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    case: Mapped["Case"] = relationship(back_populates="parties")


class CaseEventType(str, enum.Enum):
    FILING = "filing"
    HEARING = "hearing"
    SUBMISSION = "submission"
    EXPERT_REPORT = "expert_report"
    LEGAL_UPDATE = "legal_update"
    NOTE = "note"
    OTHER = "other"


class CaseEvent(Base):
    __tablename__ = "case_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    event_type: Mapped[CaseEventType] = mapped_column(str_enum(CaseEventType), default=CaseEventType.OTHER)

    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    case: Mapped["Case"] = relationship(back_populates="events")
