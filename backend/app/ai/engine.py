"""Case Intelligence Engine - the AI simulation orchestrator (section 13).

Pipeline: Case Context -> Researcher (case analysis) -> Plaintiff ->
Defendant (sees plaintiff's argument, i.e. counterarguments) -> Judge
(sees both perspectives, produces the final structured report).

This module depends only on the LLMProvider interface and the agent
prompt builders - never on the `openai` SDK directly (section 10, 27).
"""
from typing import Callable, Optional

from app.ai.agents import defendant, judge, plaintiff, researcher
from app.ai.providers.base import LLMProvider
from app.ai.schemas import AIAnalysisResult, parse_ai_response

# Bump whenever agent system prompts or the pipeline shape change in a
# way that affects the meaning of a stored result - persisted on each
# Simulation row (Phase 2) so a stored analysis can be traced back to
# exactly which prompt version produced it.
PROMPT_VERSION = "1"


def run_simulation(
    case_context: dict,
    provider: LLMProvider,
    on_stage: Optional[Callable[[str], None]] = None,
) -> AIAnalysisResult:
    """Runs the full multi-agent pipeline and returns the validated,
    structured final report. Raises AIProviderError /
    AIProviderTimeoutError (from the provider) or
    AIResponseValidationError (if the judge step's output does not
    match the required schema) - callers (the service layer) decide
    how to surface these.

    `on_stage`, if given, is called with one of "research", "plaintiff",
    "defendant", "judge", "validation" right before that stage starts
    (Phase 3 - job progress reporting). Purely a notification hook -
    never changes control flow or the return value."""

    def _stage(name: str) -> None:
        if on_stage is not None:
            on_stage(name)

    _stage("research")
    researcher_notes = provider.complete(
        system_prompt=researcher.SYSTEM_PROMPT,
        user_prompt=researcher.build_user_prompt(case_context),
    )

    _stage("plaintiff")
    plaintiff_argument = provider.complete(
        system_prompt=plaintiff.SYSTEM_PROMPT,
        user_prompt=plaintiff.build_user_prompt(case_context, researcher_notes),
    )

    _stage("defendant")
    defendant_argument = provider.complete(
        system_prompt=defendant.SYSTEM_PROMPT,
        user_prompt=defendant.build_user_prompt(case_context, researcher_notes, plaintiff_argument),
    )

    _stage("judge")
    judge_raw_response = provider.complete(
        system_prompt=judge.SYSTEM_PROMPT,
        user_prompt=judge.build_user_prompt(
            case_context, researcher_notes, plaintiff_argument, defendant_argument
        ),
        response_format="json_object",
    )

    _stage("validation")
    return parse_ai_response(judge_raw_response)
