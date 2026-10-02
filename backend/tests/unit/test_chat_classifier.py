"""Automatic chat level classification."""
import pytest

from app.ai.chat.classifier import (
    CLASSIFIER_MAX_TOKENS,
    CLASSIFIER_SYSTEM_PROMPT,
    classify_chat_level,
    classify_level,
    parse_level,
)
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.errors import AIProviderError, AIProviderTimeoutError
from app.core.config import settings


@pytest.mark.parametrize(
    "text,expected",
    [
        ("basic", "basic"),
        ("  DEEP\n", "deep"),
        ("Standard.", "standard"),
        ("Seviye: deep (çok adımlı analiz)", "deep"),
        ("Basit", "basic"),
        ("KAPSAMLI", "deep"),
        ("BASİT", "basic"),
        ("standart", "standard"),
        ("", "standard"),
        ("bilmiyorum", "standard"),
    ],
)
def test_parse_level(text, expected):
    assert parse_level(text) == expected


def test_classify_level_sends_question_and_previous_question():
    provider = MockChatProvider(chunks=["de", "ep"])
    assert classify_level(provider, "Bu sözleşmeyi TBK ve TTK açısından karşılaştır", "Kira sözleşmesi nedir?") == "deep"
    system, user = provider.calls[-1]
    assert system == {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT}
    assert user["role"] == "user"
    assert "Önceki soru: Kira sözleşmesi nedir?" in user["content"]
    assert "Yeni soru: Bu sözleşmeyi TBK ve TTK açısından karşılaştır" in user["content"]


def test_classify_level_without_previous_question():
    provider = MockChatProvider(chunks=["basic"])
    assert classify_level(provider, "İstinaf süresi kaç gün?") == "basic"
    assert "Önceki soru" not in provider.calls[-1][1]["content"]


@pytest.mark.parametrize("error", [AIProviderError("x"), AIProviderTimeoutError("x"), RuntimeError("x")])
def test_classify_level_falls_back_to_standard_on_errors(error):
    class Failing(MockChatProvider):
        def stream(self, messages):
            raise error
            yield  # pragma: no cover

    assert classify_level(Failing(), "Soru") == "standard"


def test_classify_chat_level_uses_basic_provider_with_small_cap(monkeypatch):
    seen = {}

    def fake_classifier_provider():
        provider = MockChatProvider(chunks=["deep"])
        seen["provider"] = provider
        return provider

    monkeypatch.setattr("app.ai.chat.classifier.get_chat_classifier_provider", fake_classifier_provider)
    assert classify_chat_level("Soru") == "deep"
    assert CLASSIFIER_MAX_TOKENS == 16


def test_classify_chat_level_falls_back_when_provider_misconfigured(monkeypatch):
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    assert classify_chat_level("Soru") == "standard"


def test_mock_classifier_provider_answers_standard(monkeypatch):
    from app.ai.chat.factory import get_chat_classifier_provider

    monkeypatch.setattr(settings, "chat_provider", "mock")
    provider = get_chat_classifier_provider()
    assert "".join(provider.stream([{"role": "user", "content": "basit deep kapsamlı"}])) == "standard"
    assert provider.max_tokens == 16


def test_openai_classifier_provider_uses_basic_model_cap_and_timeout(monkeypatch):
    from app.ai.chat.factory import get_chat_classifier_provider

    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "chat_model", "model-standard")
    monkeypatch.setattr(settings, "chat_model_basic", "model-basic")
    monkeypatch.setattr(settings, "chat_classifier_timeout_seconds", 5)
    provider = get_chat_classifier_provider()
    assert (provider.model, provider.max_tokens, provider._timeout) == ("model-basic", 16, 5)
