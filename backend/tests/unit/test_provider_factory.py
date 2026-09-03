"""Explicit LLM provider selection (Phase 1 - Qwen integration, section 27).

LLM_PROVIDER is the single source of truth for which provider is
constructed. This replaces the old implicit "OPENAI_API_KEY present ->
use OpenAI" behavior (see git history / IMPLEMENTATION_LOG.md for the
migration rationale). No provider is ever silently substituted for
another: a selected-but-misconfigured provider must fail loudly with
AIProviderConfigError, never silently fall back to MockProvider.
"""
import pytest


def test_defaults_to_mock_when_llm_provider_is_mock(monkeypatch):
    from app.ai.provider_factory import get_llm_provider
    from app.ai.providers.mock_provider import MockProvider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "mock")
    assert isinstance(get_llm_provider(), MockProvider)


def test_llm_provider_openai_without_key_raises_config_error(monkeypatch):
    from app.ai.errors import AIProviderConfigError
    from app.ai.provider_factory import get_llm_provider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(AIProviderConfigError):
        get_llm_provider()


def test_llm_provider_openai_with_key_returns_openai_provider(monkeypatch):
    from app.ai.provider_factory import get_llm_provider
    from app.ai.providers.openai_provider import OpenAIProvider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-fake-key")
    assert isinstance(get_llm_provider(), OpenAIProvider)


def test_llm_provider_qwen_without_api_key_raises_config_error(monkeypatch):
    from app.ai.errors import AIProviderConfigError
    from app.ai.provider_factory import get_llm_provider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", None)
    monkeypatch.setattr(settings, "qwen_base_url", "https://example.com/v1")
    with pytest.raises(AIProviderConfigError) as exc_info:
        get_llm_provider()
    assert "QWEN_API_KEY" in str(exc_info.value)


def test_llm_provider_qwen_without_base_url_raises_config_error(monkeypatch):
    from app.ai.errors import AIProviderConfigError
    from app.ai.provider_factory import get_llm_provider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", "sk-qwen-fake")
    monkeypatch.setattr(settings, "qwen_base_url", None)
    with pytest.raises(AIProviderConfigError) as exc_info:
        get_llm_provider()
    assert "QWEN_BASE_URL" in str(exc_info.value)


def test_llm_provider_qwen_with_full_config_returns_qwen_provider(monkeypatch):
    from app.ai.provider_factory import get_llm_provider
    from app.ai.providers.qwen_provider import QwenProvider
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", "sk-qwen-fake")
    monkeypatch.setattr(settings, "qwen_base_url", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setattr(settings, "qwen_model", "qwen3-32b")
    provider = get_llm_provider()
    assert isinstance(provider, QwenProvider)


def test_ai_provider_status_reports_configured_true_for_mock(monkeypatch):
    from app.ai.provider_factory import get_ai_provider_status
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "mock")
    status = get_ai_provider_status()
    assert status == {"provider": "mock", "configured": True, "error": None}


def test_ai_provider_status_reports_safe_error_for_misconfigured_qwen(monkeypatch):
    from app.ai.provider_factory import get_ai_provider_status
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", None)
    monkeypatch.setattr(settings, "qwen_base_url", None)

    status = get_ai_provider_status()
    assert status["provider"] == "qwen"
    assert status["configured"] is False
    assert "QWEN_API_KEY" in status["error"]


def test_ai_provider_status_never_leaks_the_configured_key_value(monkeypatch):
    from app.ai.provider_factory import get_ai_provider_status
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", "sk-super-secret-value-12345")
    monkeypatch.setattr(settings, "qwen_base_url", "https://example.com/v1")

    status = get_ai_provider_status()
    assert "sk-super-secret-value-12345" not in str(status)
    assert status["configured"] is True
