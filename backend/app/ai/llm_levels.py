"""Task-based levels for the single-turn LLM calls of Dosya Analizi, Canlı
Duruşma and Belgeden doldur. The level of every call is fixed by what the call does; a
LevelRoutedProvider (app.ai.provider_factory) maps the level to a model."""
from typing import Literal

from app.ai.providers.base import LLMProvider

LLMLevel = Literal["basic", "standard", "deep"]

TASK_LEVELS: dict[str, str] = {
    "analysis.research": "standard",
    "analysis.plaintiff": "standard",
    "analysis.defendant": "standard",
    "analysis.judge": "deep",
    "courtroom.opponent": "standard",
    "courtroom.judge_interim": "basic",
    "courtroom.judge_final": "deep",
    "courtroom.json_repair": "basic",
    "case_intake.extract": "standard",
    "case_intake.json_repair": "basic",
}


def level_for_task(task: str) -> str:
    try:
        return TASK_LEVELS[task]
    except KeyError:
        raise ValueError(f"Unknown LLM task: {task}") from None


def provider_for(provider: LLMProvider, task: str) -> LLMProvider:
    """The provider to use for `task`: a routed provider picks the task's
    level; any other provider (mocks in tests, mock mode) is used as is."""
    level_for_task(task)
    for_task = getattr(provider, "for_task", None)
    return for_task(task) if callable(for_task) else provider
