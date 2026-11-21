"""Claude provider: request shape, JSON hint, usage mapping, error mapping, factory selection."""
from types import SimpleNamespace

import anthropic
import pytest

from app.ai import provider_factory
from app.ai.errors import AIProviderConfigError, AIProviderError
from app.ai.providers.anthropic_provider import AnthropicProvider


class _Messages:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.kwargs = result, error, None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.result


def _provider(messages):
    p = AnthropicProvider(api_key="sk-ant-test", model="claude-sonnet-5-5")
    p._client = SimpleNamespace(messages=messages)
    return p


def test_complete_returns_text_and_usage_and_asks_for_json():
    result = SimpleNamespace(content=[SimpleNamespace(type="text", text='{"a": 1}')],
                             usage=SimpleNamespace(input_tokens=10, output_tokens=5))
    m = _Messages(result)
    out = _provider(m).complete("sistem", "kullanıcı", response_format="json_object")
    assert out == '{"a": 1}'
    assert m.kwargs["model"] == "claude-sonnet-5-5" and m.kwargs["messages"] == [{"role": "user", "content": "kullanıcı"}]
    assert "JSON" in m.kwargs["system"]


def test_usage_is_mapped():
    result = SimpleNamespace(content=[], usage=SimpleNamespace(input_tokens=3, output_tokens=4))
    p = _provider(_Messages(result))
    p.complete("s", "u")
    assert p.last_usage == {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}


def test_sdk_errors_become_provider_errors_without_leaking_details():
    p = _provider(_Messages(error=anthropic.AnthropicError("sk-ant-secret exploded")))
    with pytest.raises(AIProviderError) as exc:
        p.complete("s", "u")
    assert "secret" not in str(exc.value)


def test_factory_requires_key_and_builds_provider(monkeypatch):
    monkeypatch.setattr(provider_factory.settings, "llm_provider", "anthropic")
    monkeypatch.setattr(provider_factory.settings, "anthropic_api_key", None)
    with pytest.raises(AIProviderConfigError):
        provider_factory.build_llm_provider("claude-sonnet-5-5")
    monkeypatch.setattr(provider_factory.settings, "anthropic_api_key", "sk-ant-test")
    assert isinstance(provider_factory.build_llm_provider("claude-sonnet-5-5"), AnthropicProvider)
    assert provider_factory.standard_llm_model() == provider_factory.settings.anthropic_model
