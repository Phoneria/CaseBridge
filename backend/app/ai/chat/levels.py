"""Answer levels for the Hukuk Asistanı. The level is chosen automatically per
question by the classifier (or is Standart when CHAT_AUTO_LEVEL=false); the
backend maps it to a model, a token cap and a history size. The frontend never
sends a level or a model name."""
from dataclasses import dataclass
from typing import Literal, get_args

from app.core.config import settings

ChatLevel = Literal["basic", "standard", "deep"]
CHAT_LEVELS: tuple[str, ...] = get_args(ChatLevel)
DEFAULT_CHAT_LEVEL: ChatLevel = "standard"
LEVEL_LABELS: dict[str, str] = {"basic": "Basit", "standard": "Standart", "deep": "Kapsamlı"}


@dataclass(frozen=True)
class ChatLevelConfig:
    level: str
    label: str
    model: str
    max_tokens: int
    history_limit: int


def get_level_config(level: str = DEFAULT_CHAT_LEVEL) -> ChatLevelConfig:
    if level not in CHAT_LEVELS:
        raise ValueError(f"Unknown chat level: {level}")
    if level == "basic":
        model, max_tokens, history_limit = (
            settings.chat_model_basic,
            settings.chat_max_tokens_basic,
            settings.chat_history_limit_basic,
        )
    elif level == "deep":
        model, max_tokens, history_limit = (
            settings.chat_model_deep,
            settings.chat_max_tokens_deep,
            settings.chat_history_limit,
        )
    else:
        model, max_tokens, history_limit = (
            settings.chat_model,
            settings.chat_max_tokens_standard,
            settings.chat_history_limit,
        )
    return ChatLevelConfig(
        level=level,
        label=LEVEL_LABELS[level],
        model=(model or "").strip() or settings.chat_model,
        max_tokens=max_tokens,
        history_limit=history_limit,
    )
