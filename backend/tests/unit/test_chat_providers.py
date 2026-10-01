"""Chat provider layer: streaming parsers, mock, factory/config."""
import json
from types import SimpleNamespace

import httpx
import pytest

from app.ai.chat.factory import get_chat_provider, get_chat_provider_status
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.chat.ollama_provider import OllamaChatProvider
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.ai.chat.prompt import CHAT_PROMPT_VERSION, CHAT_SYSTEM_PROMPT
from app.ai.errors import AIProviderConfigError, AIProviderError
from app.core.config import settings

MESSAGES = [
    {"role": "system", "content": "sys"},
    {"role": "user", "content": "Kira artış oranı nedir?"},
]


def test_mock_streams_default_chunks_and_records_calls():
    provider = MockChatProvider()
    text = "".join(provider.stream(MESSAGES))
    assert "Kira artış oranı nedir?" in text
    assert provider.calls == [MESSAGES]
    assert provider.external is False
    assert provider.last_usage == {"prompt_tokens": 0, "completion_tokens": 5}


def test_mock_can_fail_mid_stream():
    provider = MockChatProvider(chunks=["a", "b", "c"], fail_after=2)
    received = []
    with pytest.raises(AIProviderError):
        for chunk in provider.stream(MESSAGES):
            received.append(chunk)
    assert received == ["a", "b"]


class _FakeCompletions:
    def __init__(self, chunks):
        self._chunks = chunks
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return iter(self._chunks)


def _openai_chunk(content=None, usage=None):
    choices = [] if content is None else [SimpleNamespace(delta=SimpleNamespace(content=content))]
    return SimpleNamespace(choices=choices, usage=usage)


def test_openai_provider_streams_deltas_and_usage():
    completions = _FakeCompletions(
        [
            _openai_chunk("Mer"),
            _openai_chunk("haba"),
            _openai_chunk(None),
            _openai_chunk(None, usage=SimpleNamespace(prompt_tokens=12, completion_tokens=3)),
        ]
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    provider = OpenAIChatProvider(api_key="k", model="ft:gpt-4o-mini:x", timeout_seconds=5, client=client)

    assert "".join(provider.stream(MESSAGES)) == "Merhaba"
    assert completions.kwargs["model"] == "ft:gpt-4o-mini:x"
    assert completions.kwargs["stream"] is True
    assert completions.kwargs["stream_options"] == {"include_usage": True}
    assert completions.kwargs["messages"] == MESSAGES
    assert provider.last_usage == {"prompt_tokens": 12, "completion_tokens": 3}
    assert provider.external is True


def test_ollama_provider_streams_ndjson():
    lines = [
        {"message": {"content": "Mer"}, "done": False},
        {"message": {"content": "haba"}, "done": False},
        {"message": {"content": ""}, "done": True, "prompt_eval_count": 7, "eval_count": 2},
    ]
    body = "\n".join(json.dumps(line) for line in lines) + "\n"

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["stream"] is True
        assert payload["model"] == "hukuk:latest"
        assert payload["messages"] == MESSAGES
        return httpx.Response(200, text=body)

    provider = OllamaChatProvider(
        base_url="http://ollama.test", model="hukuk:latest", timeout_seconds=5, transport=httpx.MockTransport(handler)
    )
    assert "".join(provider.stream(MESSAGES)) == "Merhaba"
    assert provider.last_usage == {"prompt_tokens": 7, "completion_tokens": 2}
    assert provider.external is False


def test_ollama_provider_maps_http_errors():
    provider = OllamaChatProvider(
        base_url="http://ollama.test",
        model="m",
        timeout_seconds=5,
        transport=httpx.MockTransport(lambda request: httpx.Response(500, text="boom")),
    )
    with pytest.raises(AIProviderError):
        list(provider.stream(MESSAGES))


def test_factory_defaults_to_mock(monkeypatch):
    monkeypatch.setattr(settings, "chat_provider", "mock")
    assert isinstance(get_chat_provider(), MockChatProvider)
    assert get_chat_provider_status() == {
        "provider": "mock",
        "model": "mock",
        "configured": True,
        "external": False,
        "error": None,
    }


def test_factory_openai_requires_key(monkeypatch):
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(AIProviderConfigError):
        get_chat_provider()
    status = get_chat_provider_status()
    assert status["configured"] is False
    assert status["external"] is True
    assert "OPENAI_API_KEY" in status["error"]


def test_factory_builds_openai_and_ollama(monkeypatch):
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "chat_model", "gpt-4o-mini")
    provider = get_chat_provider()
    assert isinstance(provider, OpenAIChatProvider)
    assert provider.model == "gpt-4o-mini"

    monkeypatch.setattr(settings, "chat_provider", "ollama")
    monkeypatch.setattr(settings, "chat_model", "hukuk:latest")
    provider = get_chat_provider()
    assert isinstance(provider, OllamaChatProvider)
    assert provider.model == "hukuk:latest"


def test_system_prompt_is_turkish_and_versioned():
    assert CHAT_PROMPT_VERSION == "2026-10-02"
    assert "Türk hukuku" in CHAT_SYSTEM_PROMPT
    assert "hukuki danışmanlık" in CHAT_SYSTEM_PROMPT
