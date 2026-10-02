"""Single place the rest of the app asks for "the current LLM
provider". LLM_PROVIDER is the explicit, config-driven selector
(section 27) - qwen/openai/ollama/mock. Nothing here silently substitutes one
provider for another: a selected-but-misconfigured real provider
raises AIProviderConfigError rather than quietly degrading to
MockProvider, so startup / the AI health status can report it clearly.
"""
import json
from typing import Callable, Optional

from app.ai.errors import AIProviderConfigError
from app.ai.llm_levels import level_for_task
from app.ai.providers.base import LLMProvider
from app.ai.providers.mock_provider import MockProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.providers.qwen_provider import QwenProvider
from app.ai.providers.ollama_provider import OllamaProvider
from app.core.config import settings

# Used whenever LLM_PROVIDER=mock (the default). Must be valid JSON matching
# AIAnalysisResult (app/ai/schemas.py) so simulations/analyses still complete
# end-to-end (status=completed, structured result) instead of failing with
# AIResponseValidationError just because no real provider is configured. The
# content makes clear this is a placeholder, not a real AI assessment.
_MOCK_DISABLED_RESPONSE = json.dumps(
    {
        "summary": (
            "AI özelliği bu ortamda devre dışı (LLM_PROVIDER=mock). "
            "Bu, gerçek bir yapay zeka değerlendirmesi değil, yer tutucu bir sonuçtur."
        ),
        "strong_points": [],
        "weak_points": [],
        "opposing_arguments": [],
        "missing_information": [
            "Gerçek bir AI değerlendirmesi için LLM_PROVIDER=qwen veya openai yapılandırılmalıdır."
        ],
        "possible_scenarios": [],
        "questions": [],
        "recommended_actions": [
            "Gerçek AI analizi için ortam değişkenlerinde bir sağlayıcı (Qwen veya OpenAI) yapılandırın."
        ],
        "assessment": {"score": 0, "confidence": "low"},
        "ai_disclaimer": (
            "Bu bir yer tutucu sonuçtur; AI özelliği bu ortamda devre dışıdır. "
            "Kesin bir hukuki sonuç veya garanti teşkil etmez."
        ),
        "requires_verification": True,
    },
    ensure_ascii=False,
)


def build_llm_provider(model: str) -> LLMProvider:
    """One real provider (LLM_PROVIDER=qwen/openai/ollama) for `model`."""
    provider_name = settings.llm_provider

    if provider_name == "qwen":
        if not settings.qwen_api_key or not settings.qwen_api_key.strip():
            raise AIProviderConfigError(
                "LLM_PROVIDER=qwen but QWEN_API_KEY is not set. "
                "Set QWEN_API_KEY (and QWEN_BASE_URL) in your environment, "
                "or set LLM_PROVIDER=mock to run without a real AI provider."
            )
        if not settings.qwen_base_url or not settings.qwen_base_url.strip():
            raise AIProviderConfigError(
                "LLM_PROVIDER=qwen but QWEN_BASE_URL is not set. "
                "Model Studio endpoints differ by region/workspace, so this "
                "must be configured explicitly - it is never hardcoded."
            )
        return QwenProvider(
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
            model=model,
            timeout_seconds=settings.qwen_timeout_seconds,
            enable_thinking=settings.qwen_enable_thinking,
            max_output_tokens=settings.qwen_max_output_tokens,
        )

    if provider_name == "openai":
        if not settings.openai_api_key or not settings.openai_api_key.strip():
            raise AIProviderConfigError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is not set. "
                "Set OPENAI_API_KEY in your environment, or set "
                "LLM_PROVIDER=mock to run without a real AI provider."
            )
        return OpenAIProvider(api_key=settings.openai_api_key, model=model)

    if provider_name == "ollama":
        return OllamaProvider(
            base_url=settings.ollama_base_url,
            model=model,
            timeout_seconds=settings.ollama_timeout_seconds,
            temperature=settings.ollama_temperature,
            num_ctx=settings.ollama_num_ctx,
        )

    raise AIProviderConfigError(f"LLM_PROVIDER={provider_name} has no real provider to build.")


def standard_llm_model() -> str:
    name = settings.llm_provider
    if name == "qwen":
        return settings.qwen_model
    if name == "openai":
        return settings.openai_model
    if name == "ollama":
        return settings.ollama_model
    return "mock"


def llm_model_for_level(level: str) -> str:
    override = {"basic": settings.llm_model_basic, "deep": settings.llm_model_deep}.get(level, "")
    return (override or "").strip() or standard_llm_model()


class LevelRoutedProvider(LLMProvider):
    """One LLMProvider per configured model; `for_task(task)` returns the one
    for the task's level. Direct `complete()` calls use Standart. Usage and
    latency reflect the most recently used underlying provider."""

    def __init__(self, build: Callable[[str], LLMProvider], model_for_level: Callable[[str], str]):
        self._build = build
        self._model_for_level = model_for_level
        self._providers: dict[str, LLMProvider] = {}
        self._last: Optional[LLMProvider] = None
        self._standard = self._provider_for_level("standard")  # surfaces config errors now

    def _provider_for_level(self, level: str) -> LLMProvider:
        model = self._model_for_level(level)
        if model not in self._providers:
            self._providers[model] = self._build(model)
        return self._providers[model]

    def for_task(self, task: str) -> LLMProvider:
        return _TrackedProvider(self, self._provider_for_level(level_for_task(task)))

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        return _TrackedProvider(self, self._standard).complete(
            system_prompt, user_prompt, response_format=response_format
        )

    @property
    def last_usage(self) -> Optional[dict]:  # type: ignore[override]
        return self._last.last_usage if self._last is not None else None

    @property
    def last_latency_ms(self) -> Optional[float]:  # type: ignore[override]
        return self._last.last_latency_ms if self._last is not None else None


class _TrackedProvider(LLMProvider):
    def __init__(self, router: LevelRoutedProvider, inner: LLMProvider):
        self._router = router
        self._inner = inner

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        self._router._last = self._inner
        return self._inner.complete(system_prompt, user_prompt, response_format=response_format)

    @property
    def last_usage(self) -> Optional[dict]:  # type: ignore[override]
        return self._inner.last_usage

    @property
    def last_latency_ms(self) -> Optional[float]:  # type: ignore[override]
        return self._inner.last_latency_ms


def get_llm_provider() -> LLMProvider:
    if settings.llm_provider in ("qwen", "openai", "ollama"):
        return LevelRoutedProvider(build=build_llm_provider, model_for_level=llm_model_for_level)
    return MockProvider(default_response=_MOCK_DISABLED_RESPONSE)


def get_courtroom_provider() -> LLMProvider:
    """Interactive simulations need role-shaped mock JSON in offline mode."""
    if settings.llm_provider == "mock":
        from app.ai.courtroom import CourtroomMockProvider

        return CourtroomMockProvider()
    return get_llm_provider()


def get_ai_provider_status() -> dict:
    """Safe (no secret values), user-facing status of the configured AI
    provider - for the AI health/status surface (Settings page, /health
    or a dedicated endpoint). Never raises: a misconfiguration is
    reported as data, not an exception, so a status page can always
    render it."""
    try:
        get_llm_provider()
    except AIProviderConfigError as exc:
        return {"provider": settings.llm_provider, "configured": False, "error": str(exc)}
    return {"provider": settings.llm_provider, "configured": True, "error": None}
