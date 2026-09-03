"""OpenAI provider error handling (section 22 - AI Analysis).

Never let a raw SDK exception (which could include request/response
detail) propagate to callers or logs unmapped; always translate to our
own AIProviderError / AIProviderTimeoutError, and never leak the API
key in any exception message.
"""
import httpx
import openai
import pytest


def _make_provider():
    from app.ai.providers.openai_provider import OpenAIProvider

    return OpenAIProvider(api_key="sk-super-secret-test-key", model="gpt-4o-mini")


def test_timeout_is_translated_to_ai_provider_timeout_error(monkeypatch):
    from app.ai.errors import AIProviderTimeoutError

    provider = _make_provider()
    fake_request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def _raise_timeout(*args, **kwargs):
        raise openai.APITimeoutError(request=fake_request)

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_timeout)

    with pytest.raises(AIProviderTimeoutError):
        provider.complete(system_prompt="sys", user_prompt="user")


def test_api_error_is_translated_to_ai_provider_error(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider()
    fake_request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def _raise_api_error(*args, **kwargs):
        raise openai.APIConnectionError(request=fake_request)

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_api_error)

    with pytest.raises(AIProviderError):
        provider.complete(system_prompt="sys", user_prompt="user")


def test_provider_errors_never_leak_the_api_key(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider()
    fake_request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def _raise_api_error(*args, **kwargs):
        raise openai.APIConnectionError(request=fake_request)

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_api_error)

    try:
        provider.complete(system_prompt="sys", user_prompt="user")
        assert False, "expected AIProviderError"
    except AIProviderError as exc:
        assert "sk-super-secret-test-key" not in str(exc)
