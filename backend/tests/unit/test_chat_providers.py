"""Chat provider layer: streaming parsers, mock, factory/config."""
import json
from types import SimpleNamespace

import httpx
import openai
import pytest

from app.ai.chat.factory import get_chat_provider, get_chat_provider_status
from app.ai.chat.levels import CHAT_LEVELS, DEFAULT_CHAT_LEVEL, get_level_config
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.chat.ollama_provider import OllamaChatProvider
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.ai.chat.prompt import CHAT_PROMPT_VERSION, CHAT_SYSTEM_PROMPT, system_prompt_for
from app.ai.errors import AIProviderConfigError, AIProviderError, AIProviderTimeoutError
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


def test_mock_resets_last_usage_on_new_stream():
    provider = MockChatProvider()
    list(provider.stream(MESSAGES))
    assert provider.last_usage is not None
    gen = provider.stream(MESSAGES)
    next(gen)
    assert provider.last_usage is None


class _MidStreamFailCompletions:
    def __init__(self, exc):
        self._exc = exc

    def create(self, **kwargs):
        exc = self._exc

        def gen():
            yield _openai_chunk("ilk")
            raise exc

        return gen()


def _openai_with_failure(exc):
    client = SimpleNamespace(chat=SimpleNamespace(completions=_MidStreamFailCompletions(exc)))
    return OpenAIChatProvider(api_key="k", model="m", client=client)


_REQ = httpx.Request("POST", "http://x")


@pytest.mark.parametrize(
    "exc,expected",
    [
        (openai.APITimeoutError(request=_REQ), AIProviderTimeoutError),
        (openai.APIConnectionError(request=_REQ), AIProviderError),
        (openai.APIError("secret-detail", request=_REQ, body=None), AIProviderError),
        (httpx.ReadError("boom"), AIProviderError),
        (httpx.RemoteProtocolError("boom"), AIProviderError),
        (httpx.ReadTimeout("boom"), AIProviderTimeoutError),
        (RuntimeError("secret-detail"), AIProviderError),
    ],
)
def test_openai_maps_mid_stream_failures(exc, expected):
    provider = _openai_with_failure(exc)
    received = []
    with pytest.raises(AIProviderError) as info:
        for chunk in provider.stream(MESSAGES):
            received.append(chunk)
    assert received == ["ilk"]
    assert type(info.value) is expected
    assert "secret-detail" not in str(info.value) and "boom" not in str(info.value)


def test_openai_generator_exit_is_not_converted():
    provider = _openai_with_failure(httpx.ReadError("boom"))
    gen = provider.stream(MESSAGES)
    assert next(gen) == "ilk"
    gen.close()  # must not raise


def test_openai_client_construction_error_maps_to_provider_error(monkeypatch):
    def boom(**kwargs):
        raise openai.OpenAIError("secret-detail")

    monkeypatch.setattr(openai, "OpenAI", boom)
    provider = OpenAIChatProvider(api_key="k", model="m")
    with pytest.raises(AIProviderError) as info:
        list(provider.stream(MESSAGES))
    assert "secret-detail" not in str(info.value)


def _ollama(handler):
    return OllamaChatProvider(
        base_url="http://ollama.test", model="m", timeout_seconds=5, transport=httpx.MockTransport(handler)
    )


@pytest.mark.parametrize("body", ["[1, 2]\n", "\"text\"\n", "42\n", "null\n"])
def test_ollama_non_dict_line_is_provider_error(body):
    provider = _ollama(lambda request: httpx.Response(200, text=body))
    with pytest.raises(AIProviderError):
        list(provider.stream(MESSAGES))


def test_ollama_error_line_uses_fixed_message():
    body = json.dumps({"message": {"content": "a"}}) + "\n" + json.dumps({"error": "secret-detail"}) + "\n"
    provider = _ollama(lambda request: httpx.Response(200, text=body))
    received = []
    with pytest.raises(AIProviderError) as info:
        for chunk in provider.stream(MESSAGES):
            received.append(chunk)
    assert received == ["a"]
    assert "secret-detail" not in str(info.value)


def test_ollama_timeout_maps_to_timeout_error():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(AIProviderTimeoutError):
        list(_ollama(handler).stream(MESSAGES))


@pytest.mark.parametrize("exc", [httpx.InvalidURL("bad"), httpx.StreamClosed(), RuntimeError("x")])
def test_ollama_non_http_errors_map_to_provider_error(exc):
    def handler(request):
        raise exc

    with pytest.raises(AIProviderError):
        list(_ollama(handler).stream(MESSAGES))


def _level_settings(monkeypatch, **overrides):
    values = {
        "chat_model": "model-standard",
        "chat_model_basic": "",
        "chat_model_deep": "",
        "chat_max_tokens_basic": 500,
        "chat_max_tokens_standard": 1500,
        "chat_max_tokens_deep": 4000,
        "chat_history_limit_basic": 6,
        "chat_history_limit": 20,
    }
    values.update(overrides)
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)


def test_levels_are_ordered_and_default_to_standard():
    assert CHAT_LEVELS == ("basic", "standard", "deep")
    assert DEFAULT_CHAT_LEVEL == "standard"


def test_empty_level_models_fall_back_to_chat_model(monkeypatch):
    _level_settings(monkeypatch)
    basic = get_level_config("basic")
    standard = get_level_config("standard")
    deep = get_level_config("deep")
    assert (basic.model, standard.model, deep.model) == ("model-standard",) * 3
    assert (basic.label, standard.label, deep.label) == ("Basit", "Standart", "Kapsamlı")
    assert (basic.max_tokens, standard.max_tokens, deep.max_tokens) == (500, 1500, 4000)
    assert (basic.history_limit, standard.history_limit, deep.history_limit) == (6, 20, 20)


def test_level_specific_models_are_used(monkeypatch):
    _level_settings(monkeypatch, chat_model_basic=" model-basic ", chat_model_deep="model-deep")
    assert get_level_config("basic").model == "model-basic"
    assert get_level_config("deep").model == "model-deep"
    assert get_level_config().model == "model-standard"


def test_unknown_level_raises():
    with pytest.raises(ValueError):
        get_level_config("expert")


def test_system_prompt_for_levels():
    assert system_prompt_for("standard") == CHAT_SYSTEM_PROMPT
    assert system_prompt_for(None) == CHAT_SYSTEM_PROMPT
    basic = system_prompt_for("basic")
    deep = system_prompt_for("deep")
    assert basic.startswith(CHAT_SYSTEM_PROMPT + "\n\n") and "kısa ve öz" in basic
    assert deep.startswith(CHAT_SYSTEM_PROMPT + "\n\n") and "adım adım" in deep


def test_openai_passes_max_completion_tokens_only_when_set():
    completions = _FakeCompletions([_openai_chunk("ok")])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    provider = OpenAIChatProvider(api_key="k", model="m", client=client, max_tokens=500)
    assert "".join(provider.stream(MESSAGES)) == "ok"
    assert completions.kwargs["max_completion_tokens"] == 500

    completions = _FakeCompletions([_openai_chunk("ok")])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    list(OpenAIChatProvider(api_key="k", model="m", client=client).stream(MESSAGES))
    assert "max_completion_tokens" not in completions.kwargs


def test_ollama_passes_num_predict_only_when_set():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=json.dumps({"message": {"content": "ok"}, "done": True}) + "\n")

    list(OllamaChatProvider(base_url="http://ollama.test", model="m", transport=httpx.MockTransport(handler), max_tokens=300).stream(MESSAGES))
    list(OllamaChatProvider(base_url="http://ollama.test", model="m", transport=httpx.MockTransport(handler)).stream(MESSAGES))
    assert seen[0]["options"] == {"num_predict": 300}
    assert "options" not in seen[1]


def test_factory_builds_a_provider_per_level(monkeypatch):
    _level_settings(monkeypatch, chat_model_basic="model-basic")
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    basic = get_chat_provider("basic")
    assert (basic.model, basic.max_tokens) == ("model-basic", 500)
    standard = get_chat_provider()
    assert (standard.model, standard.max_tokens) == ("model-standard", 1500)

    monkeypatch.setattr(settings, "chat_provider", "mock")
    mock = get_chat_provider("deep")
    assert isinstance(mock, MockChatProvider)
    assert (mock.model, mock.max_tokens) == ("mock", 4000)


def test_mock_reports_finish_reason_after_a_full_stream():
    provider = MockChatProvider(chunks=["a", "b"])
    stream = provider.stream(MESSAGES)
    assert next(stream) == "a"
    assert provider.last_finish_reason is None  # reset at stream start
    list(stream)
    assert provider.last_finish_reason == "stop"

    capped = MockChatProvider(chunks=["a"], finish_reason="length")
    list(capped.stream(MESSAGES))
    assert capped.last_finish_reason == "length"


def _openai_finish_chunk(reason):
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None), finish_reason=reason)], usage=None)


def test_openai_records_finish_reason():
    completions = _FakeCompletions([_openai_chunk("Yarım"), _openai_finish_chunk("length"), _openai_chunk(None)])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    provider = OpenAIChatProvider(api_key="k", model="m", client=client, max_tokens=5)
    provider.last_finish_reason = "stale"
    assert "".join(provider.stream(MESSAGES)) == "Yarım"
    assert provider.last_finish_reason == "length"


def test_ollama_records_done_reason():
    body = (
        json.dumps({"message": {"content": "Yarım"}, "done": False})
        + "\n"
        + json.dumps({"message": {"content": ""}, "done": True, "done_reason": "length"})
        + "\n"
    )
    provider = OllamaChatProvider(
        base_url="http://ollama.test", model="m", transport=httpx.MockTransport(lambda r: httpx.Response(200, text=body))
    )
    assert "".join(provider.stream(MESSAGES)) == "Yarım"
    assert provider.last_finish_reason == "length"
