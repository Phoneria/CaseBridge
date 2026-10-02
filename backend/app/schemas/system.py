from typing import List, Optional

from pydantic import BaseModel


class AIStatusOut(BaseModel):
    provider: str
    configured: bool
    error: Optional[str] = None


class AIConnectivityCheck(BaseModel):
    name: str
    provider: str
    model: str
    reachable: bool
    detail: Optional[str] = None


class AIConnectivityOut(BaseModel):
    connected: bool
    checks: List[AIConnectivityCheck]
    checked_at: float


class AIUsageOut(BaseModel):
    period_start: str
    used_tokens: int
    budget_tokens: Optional[int] = None
    remaining_percent: Optional[float] = None
    unlimited: bool
