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


def test_classify_chat_level_uses_the_classifier_provider(monkeypatch):
    seen = {}

    def fake_classifier_provider():
        provider = MockChatProvider(chunks=["deep"])
        seen["provider"] = provider
        return provider

    monkeypatch.setattr("app.ai.chat.classifier.get_chat_classifier_provider", fake_classifier_provider)
    assert classify_chat_level("Soru") == "deep"
    assert seen["provider"].calls
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


def test_openai_classifier_provider_disables_sdk_retries(monkeypatch):
    from app.ai.chat.factory import get_chat_classifier_provider, get_chat_provider

    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    assert get_chat_classifier_provider()._max_retries == 0
    assert get_chat_provider()._max_retries is None


def test_openai_client_gets_max_retries_only_when_set(monkeypatch):
    from types import SimpleNamespace

    import openai

    from app.ai.chat.openai_provider import OpenAIChatProvider

    captured = []

    class FakeCompletions:
        def create(self, **kwargs):
            return iter([SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="ok"), finish_reason=None)], usage=None)])

    def fake_openai(**kwargs):
        captured.append(kwargs)
        return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

    monkeypatch.setattr(openai, "OpenAI", fake_openai)
    msgs = [{"role": "user", "content": "x"}]
    assert "".join(OpenAIChatProvider(api_key="k", model="m", max_retries=0).stream(msgs)) == "ok"
    assert captured[-1]["max_retries"] == 0
    list(OpenAIChatProvider(api_key="k", model="m").stream(msgs))
    assert "max_retries" not in captured[-1]


@pytest.mark.parametrize("reply_chunks", [[], ["bilmiyorum"]])
def test_classify_level_warns_without_content_when_answer_unusable(reply_chunks, caplog):
    import logging

    provider = MockChatProvider(chunks=reply_chunks)
    with caplog.at_level(logging.WARNING, logger="casebridge"):
        assert classify_level(provider, "GİZLİ-SORU-METNİ") == "standard"
    messages = [r.getMessage() for r in caplog.records]
    assert any("no usable answer" in m for m in messages)
    assert not any("GİZLİ-SORU-METNİ" in m for m in messages)
