"""Structured AI output schema (section 14, 15) and validation helper.

Every AI analysis/simulation result must pass through AIAnalysisResult
before it is ever persisted or returned to the frontend. A malformed
or incomplete model response is a validation error, not a stored
result - callers must handle AIResponseValidationError explicitly.
"""
import json
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.ai.errors import AIResponseValidationError

DEFAULT_AI_DISCLAIMER = (
    "Bu değerlendirme yapay zeka tarafından üretilmiş bir tahmindir; "
    "kesin bir hukuki sonuç veya garanti teşkil etmez. Nihai değerlendirme "
    "için bir hukuk profesyoneli tarafından incelenmelidir."
)

AssessmentConfidence = Literal["low", "medium", "high"]


class Assessment(BaseModel):
    score: int = Field(ge=0, le=100)
    confidence: AssessmentConfidence


class AIAnalysisResult(BaseModel):
    summary: str
    strong_points: list[str] = Field(default_factory=list)
    weak_points: list[str] = Field(default_factory=list)
    opposing_arguments: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    possible_scenarios: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    assessment: Assessment
    ai_disclaimer: str = DEFAULT_AI_DISCLAIMER
    requires_verification: bool = False


def parse_ai_response(raw_response: str) -> AIAnalysisResult:
    """Parse and validate a raw LLM text response as structured JSON.
    Raises AIResponseValidationError (never a bare JSONDecodeError or
    pydantic ValidationError) so calling code has one exception type
    to handle."""
    try:
        payload = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise AIResponseValidationError(f"AI response was not valid JSON: {exc}") from exc

    try:
        return AIAnalysisResult.model_validate(payload)
    except ValidationError as exc:
        raise AIResponseValidationError(f"AI response did not match expected schema: {exc}") from exc
