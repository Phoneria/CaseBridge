from pydantic import BaseModel

from app.schemas.admin_user import AdminUserOut


class WorkloadCase(BaseModel):
    id: str
    case_number: str
    case_name: str


class WorkloadTask(BaseModel):
    id: str
    title: str
    case_name: str


class WorkloadOut(BaseModel):
    open_cases: list[WorkloadCase]
    pending_tasks: list[WorkloadTask]
    precedents_reviewing: int


class DeactivateRequest(BaseModel):
    transfer_to: str | None = None


class TransferCounts(BaseModel):
    cases: int
    tasks: int
    precedents: int


class DeactivateOut(BaseModel):
    user: AdminUserOut
    transferred: TransferCounts
