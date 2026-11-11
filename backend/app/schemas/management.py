from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)]
Money = Annotated[Decimal, Field(ge=0, le=Decimal("999999999999.99"), max_digits=14, decimal_places=2, allow_inf_nan=False)]
ID = Annotated[str, StringConstraints(min_length=1, max_length=36)]
Kind = Literal["finance", "time", "client", "communication", "lead", "approval", "deadline", "checklist", "leave", "publication", "support"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FinanceData(Strict):
    entry_type: Literal["fee", "payment", "expense", "reimbursement", "advance", "advance_spend"]
    amount: Money = Field(gt=0)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    entry_date: date
    note: Note = ""


class TimeData(Strict):
    work_date: date
    minutes: int = Field(ge=1, le=1440)
    hourly_cost: Money = Decimal("0")
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    note: Note = ""


class ClientData(Strict):
    case_ids: list[ID] = Field(default=[], max_length=1000)
    email: EmailStr | None = None
    phone: Annotated[str, StringConstraints(max_length=50)] = ""
    company: Annotated[str, StringConstraints(max_length=255)] = ""
    contact_date: date | None = None
    next_contact_date: date | None = None
    note: Note = ""


class CommunicationData(Strict):
    client_id: ID
    contact_date: date
    channel: Literal["phone", "email", "meeting", "other"] = "meeting"
    promise: Note = ""
    note: Note = ""


class LeadData(Strict):
    client_name: Text
    opposing_party: Annotated[str, StringConstraints(max_length=255)] = ""
    email: EmailStr | None = None
    waiting_reason: Annotated[str, StringConstraints(max_length=1000)] = ""
    conflict_decision: Literal["pending", "clear", "blocked"] = "pending"
    conflict_reason: Annotated[str, StringConstraints(max_length=1000)] = ""
    note: Note = ""


class ApprovalData(Strict):
    document_id: ID | None = None
    revision: int = Field(default=1, ge=1, le=10000)
    content: Note = ""
    review_note: Note = ""


class DeadlineData(Strict):
    source: Text
    backup_id: ID
    verified: bool = False
    reminder_days: list[int] = Field(default=[7, 3, 1, 0], max_length=10)
    note: Note = ""

    @model_validator(mode="after")
    def offsets(self):
        if any(day < 0 or day > 365 for day in self.reminder_days):
            raise ValueError("Hatırlatma günü 0–365 arasında olmalı.")
        self.reminder_days = sorted(set(self.reminder_days), reverse=True)
        return self


class ChecklistItem(Strict):
    title: Text
    done: bool = False
    depends_on: int | None = Field(default=None, ge=0)


class ChecklistData(Strict):
    template: Literal["opening", "hearing", "closing", "custom"] = "custom"
    items: list[ChecklistItem] = Field(min_length=1, max_length=100)
    note: Note = ""

    @model_validator(mode="after")
    def dependencies(self):
        for index, item in enumerate(self.items):
            if item.depends_on is not None:
                if item.depends_on >= index:
                    raise ValueError("Bağımlılık önceki bir adıma işaret etmeli.")
                if item.done and not self.items[item.depends_on].done:
                    raise ValueError("Önce bağımlı adımı tamamlayın.")
        return self


class LeaveData(Strict):
    starts_on: date
    ends_on: date
    backup_id: ID
    note: Note = ""

    @model_validator(mode="after")
    def dates(self):
        if self.ends_on < self.starts_on:
            raise ValueError("İzin bitişi başlangıçtan önce olamaz.")
        return self


class PublicationData(Strict):
    audience_ids: list[ID] = Field(min_length=1, max_length=100)
    document_ids: list[ID] = Field(default=[], max_length=100)
    message: Note
    request: Note = ""
    appointment: date | None = None
    financial_summary: Annotated[str, StringConstraints(max_length=1000)] = ""


class SupportData(Strict):
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    contact_name: Annotated[str, StringConstraints(max_length=255)] = ""
    note: Note = ""


DATA_MODELS = {
    "finance": FinanceData, "time": TimeData, "client": ClientData,
    "communication": CommunicationData, "lead": LeadData, "approval": ApprovalData,
    "deadline": DeadlineData, "checklist": ChecklistData, "leave": LeaveData,
    "publication": PublicationData, "support": SupportData,
}
STATES = {
    "finance": ["recorded"], "time": ["recorded"], "client": ["active", "inactive"],
    "communication": ["recorded"],
    "lead": ["new", "meeting", "evaluation", "offer", "contract", "documents", "opened", "declined"],
    "approval": ["draft", "review", "changes", "approved"],
    "deadline": ["open", "acknowledged", "completed"],
    "checklist": ["open", "completed"], "leave": ["requested", "approved", "cancelled"],
    "publication": ["draft", "published"], "support": ["open", "in_progress", "resolved"],
}


class RecordWrite(Strict):
    kind: Kind
    title: Text
    status: str = Field(max_length=32)
    case_id: ID | None = None
    owner_id: ID | None = None
    due_date: date | None = None
    data: dict
    version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def body(self):
        self.data = DATA_MODELS[self.kind].model_validate(self.data).model_dump(mode="json")
        if self.status not in STATES[self.kind]:
            raise ValueError("Bu kayıt türü için geçersiz durum.")
        if self.kind in {"finance", "time", "approval", "deadline", "checklist", "publication"} and not self.case_id:
            raise ValueError("Bu işlem için dava seçin.")
        if self.kind in {"deadline", "leave", "time", "approval"} and not self.owner_id:
            raise ValueError("Sorumlu seçin.")
        if self.kind == "deadline" and not self.due_date:
            raise ValueError("Kritik süre için son tarih gerekli.")
        if self.kind == "checklist" and self.status == "completed" and not all(x["done"] for x in self.data["items"]):
            raise ValueError("Önce tüm kontrol adımlarını tamamlayın.")
        return self


class VersionAction(Strict):
    version: int = Field(ge=1)
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class AccessWrite(Strict):
    position: Literal["lawyer", "trainee", "secretary", "accountant", "consultant", "client"]
    case_ids: list[ID] = Field(max_length=1000)
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class ScopedInvite(AccessWrite):
    full_name: Text
    email: EmailStr


class ProfileWrite(Strict):
    version: int = Field(default=0, ge=0)
    contact_name: Annotated[str, StringConstraints(max_length=255)] = ""
    email: EmailStr | None = None
    phone: Annotated[str, StringConstraints(max_length=50)] = ""
    address: Annotated[str, StringConstraints(max_length=1000)] = ""
    billing_title: Annotated[str, StringConstraints(max_length=255)] = ""
    tax_office: Annotated[str, StringConstraints(max_length=255)] = ""
    tax_number: Annotated[str, StringConstraints(max_length=32)] = ""
    plan: Literal["trial", "standard", "professional", "enterprise"] = "trial"
    seats: int = Field(default=5, ge=1, le=100000)
    storage_limit_mb: int = Field(default=1024, ge=1, le=100000000)
    renewal_date: date | None = None
    payment_status: Literal["trial", "current", "overdue", "cancelled"] = "trial"
    account_owner: Annotated[str, StringConstraints(max_length=255)] = ""
    next_contact_date: date | None = None
    commitments: Note = ""
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]
