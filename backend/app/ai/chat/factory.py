"""Single place to get the configured chat provider. No silent fallback:
a selected-but-misconfigured provider raises AIProviderConfigError."""
from app.ai.chat.base import ChatProvider
from app.ai.chat.levels import CHAT_LEVELS, DEFAULT_CHAT_LEVEL, get_level_config
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.chat.ollama_provider import OllamaChatProvider
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.ai.errors import AIProviderConfigError
from app.core.config import settings


def get_chat_provider(level: str = DEFAULT_CHAT_LEVEL) -> ChatProvider:
    config = get_level_config(level)
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
            timeout_seconds=settings.chat_timeout_seconds,
            max_tokens=config.max_tokens,
        )
    if name == "ollama":
        if not settings.ollama_base_url or not settings.ollama_base_url.strip():
            raise AIProviderConfigError("CHAT_PROVIDER=ollama but OLLAMA_BASE_URL is not set.")
        return OllamaChatProvider(
            base_url=settings.ollama_base_url,
            model=config.model,
            timeout_seconds=settings.chat_timeout_seconds,
            max_tokens=config.max_tokens,
        )
    return MockChatProvider(max_tokens=config.max_tokens)


def _levels() -> list[dict]:
    mock = settings.chat_provider not in ("openai", "ollama")
    result = []
    for level in CHAT_LEVELS:
        config = get_level_config(level)
        result.append({"level": level, "label": config.label, "model": "mock" if mock else config.model})
    return result


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
            "levels": _levels(),
        }
    return {
        "provider": provider.provider,
        "model": provider.model,
        "configured": True,
        "external": provider.external,
        "error": None,
        "levels": _levels(),
    }
