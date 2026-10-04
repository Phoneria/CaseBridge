from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.courtroom import (
    CourtroomActor,
    CourtroomPhase,
    CourtroomRole,
    CourtroomSessionStatus,
    CourtroomTurnType,
    ScenarioDifficulty,
)


class CourtroomScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    title: str
    summary: str
    category: str
    plaintiff_name: str
    defendant_name: str
    difficulty: ScenarioDifficulty
    estimated_rounds: int
    learning_objectives: list[str]
    public_facts: list[str]
    disputed_issues: list[str]
    legal_context: list[str]


class ScenarioEvidenceOut(BaseModel):
    id: str
    code: str
    title: str
    description: str
    evidence_type: str
    content: str
    authenticity_status: str


class CourtroomTurnOut(BaseModel):
    id: str
    sequence_number: int
    actor: CourtroomActor
    legal_role: str
    turn_type: CourtroomTurnType
    content: str
    evidence_code: str | None = None
    evidence_title: str | None = None
    structured_data: dict[str, Any]
    created_at: datetime


class JudgeEvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    verdict: Literal["plaintiff", "defendant", "partial", "undetermined"]
    summary: str
    reasoning: str
    evidence_assessment: list[str]
    unanswered_questions: list[str]
    user_strengths: list[str]
    user_weaknesses: list[str]
    learning_notes: list[str]
    relevance_score: int
    evidence_score: int
    rebuttal_score: int
    courtroom_strategy_score: int
    total_score: int
    confidence: Literal["low", "medium", "high"]
    requires_verification: bool
    disclaimer: str


class CourtroomSessionSummaryOut(BaseModel):
    id: str
    scenario_id: str
    scenario_title: str
    chosen_role: CourtroomRole
    status: CourtroomSessionStatus
    phase: CourtroomPhase
    current_actor: CourtroomActor
    round_number: int
    max_rounds: int
    total_score: int | None = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime


class CourtroomSessionOut(CourtroomSessionSummaryOut):
    scenario: CourtroomScenarioOut
    role_brief: dict[str, Any]
    available_evidence: list[ScenarioEvidenceOut]
    turns: list[CourtroomTurnOut]
    pending_judge_question: str | None = None
    presented_evidence_codes: list[str]
    admitted_evidence_codes: list[str]
    rejected_evidence_codes: list[str]
    error_message: str | None = None
    failure_category: str | None = None
    model: str | None = None
    prompt_version: str
    evaluation: JudgeEvaluationOut | None = None


class CourtroomSessionCreate(BaseModel):
    scenario_id: str
    chosen_role: CourtroomRole


class CourtroomCaseSessionCreate(BaseModel):
    case_id: str
    chosen_role: CourtroomRole


class CourtroomMoveCreate(BaseModel):
    content: str = Field(min_length=2, max_length=4000)
    action_type: Literal["opening", "argument", "rebuttal", "evidence", "objection", "answer", "closing"]
    evidence_code: str | None = Field(default=None, max_length=60)
    client_request_id: str | None = Field(default=None, min_length=8, max_length=64)
