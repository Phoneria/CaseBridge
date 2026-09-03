from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.ai.schemas import AIAnalysisResult
from app.models.simulation import SimulationStatus


class SimulationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    status: SimulationStatus
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[AIAnalysisResult] = None

    # Run metadata (Phase 2) - safe to expose: no secrets, no raw
    # provider/SDK detail, no chain-of-thought.
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    context_version: Optional[str] = None
    duration_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    failure_category: Optional[str] = None
    current_stage: Optional[str] = None

class SimulationWithCaseOut(SimulationOut):
    case_name: str
    case_number: str
