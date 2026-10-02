"""Single place to get the configured chat provider. No silent fallback:
a selected-but-misconfigured provider raises AIProviderConfigError."""
from typing import Optional

from app.ai.chat.base import ChatProvider
from app.ai.chat.levels import DEFAULT_CHAT_LEVEL, get_level_config
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.chat.ollama_provider import OllamaChatProvider
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.ai.errors import AIProviderConfigError
from app.core.config import settings


def get_chat_provider(
    level: str = DEFAULT_CHAT_LEVEL,
    *,
    max_tokens: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
    max_retries: Optional[int] = None,
) -> ChatProvider:
    config = get_level_config(level)
    cap = max_tokens if max_tokens is not None else config.max_tokens
    timeout = timeout_seconds if timeout_seconds is not None else settings.chat_timeout_seconds
    name = settings.chat_provider
    if name == "openai":
        if not settings.openai_api_key or not settings.openai_api_key.strip():
            raise AIProviderConfigError(
                "CHAT_PROVIDER=openai but OPENAI_API_KEY is not set. "
                "Set OPENAI_API_KEY, or set CHAT_PROVIDER=mock to run without a real AI provider."
            )
        return OpenAIChatProvider(
            api_key=settings.openai_api_key,
            model=config.model,
            timeout_seconds=timeout,
            max_tokens=cap,
            max_retries=max_retries,
        )
    if name == "ollama":
        if not settings.ollama_base_url or not settings.ollama_base_url.strip():
            raise AIProviderConfigError("CHAT_PROVIDER=ollama but OLLAMA_BASE_URL is not set.")
        return OllamaChatProvider(
            base_url=settings.ollama_base_url,
            model=config.model,
            timeout_seconds=timeout,
            max_tokens=cap,
        )
    return MockChatProvider(max_tokens=cap)


def get_chat_classifier_provider() -> ChatProvider:
    """The Basit model with a tiny output cap and short timeout, used to pick
    each question's level. Mock mode always answers "standard"."""
    from app.ai.chat.classifier import CLASSIFIER_MAX_TOKENS

    if settings.chat_provider not in ("openai", "ollama"):
        return MockChatProvider(chunks=["standard"], max_tokens=CLASSIFIER_MAX_TOKENS)
    return get_chat_provider(
        "basic",
        max_tokens=CLASSIFIER_MAX_TOKENS,
        timeout_seconds=settings.chat_classifier_timeout_seconds,
        max_retries=0,
    )


def get_chat_provider_status() -> dict:
    """Safe, user-facing status (no secrets). Never raises."""
    external = settings.chat_provider == "openai"
    try:
        provider = get_chat_provider()
    except AIProviderConfigError as exc:
        return {
            "provider": settings.chat_provider,
            "model": settings.chat_model,
            "configured": False,
            "external": external,
            "error": str(exc),
        }
    return {
        "provider": provider.provider,
        "model": provider.model,
        "configured": True,
        "external": provider.external,
        "error": None,
    }
