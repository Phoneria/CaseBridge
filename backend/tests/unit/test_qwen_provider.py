"""QwenProvider: OpenAI-compatible provider for Alibaba Model Studio
(DashScope) qwen3-32b (Phase 1, section 27).

Uses the same "monkeypatch the underlying SDK client" pattern as
tests/unit/test_openai_provider_error_handling.py - no real network
call is ever made in this suite.
"""
import httpx
import openai
import pytest


def _make_provider(**overrides):
    from app.ai.providers.qwen_provider import QwenProvider

    kwargs = dict(
        api_key="sk-qwen-super-secret-test-key",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )
    kwargs.update(overrides)
    return QwenProvider(**kwargs)


def _fake_request():
    return httpx.Request("POST", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions")


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeUsage:
    def __init__(self, prompt_tokens=10, completion_tokens=20, total_tokens=30):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens


class _FakeResponse:
    def __init__(self, content, usage=None):
        self.choices = [_FakeChoice(content)]
        self.usage = usage


class _FakeDelta:
    def __init__(self, content=None, reasoning_content=None):
        self.content = content
        self.reasoning_content = reasoning_content


class _FakeStreamChoice:
    def __init__(self, delta):
        self.delta = delta


class _FakeStreamChunk:
    def __init__(self, delta=None, usage=None):
        self.choices = [_FakeStreamChoice(delta)] if delta is not None else []
        self.usage = usage


# --- construction / configuration -----------------------------------------


def test_qwen_provider_satisfies_llm_provider_interface():
    from app.ai.providers.base import LLMProvider

    provider = _make_provider()
    assert isinstance(provider, LLMProvider)


def test_qwen_provider_requires_api_key():
    from app.ai.errors import AIProviderConfigError

    with pytest.raises(AIProviderConfigError):
        _make_provider(api_key="")


def test_qwen_provider_requires_base_url():
    from app.ai.errors import AIProviderConfigError

    with pytest.raises(AIProviderConfigError):
        _make_provider(base_url="")


def test_qwen_provider_defaults():
    provider = _make_provider()
    assert provider._model == "qwen3-32b"
    assert provider._enable_thinking is False
    assert provider._timeout_seconds == 90.0
    assert provider._max_output_tokens == 8192


def test_qwen_provider_accepts_explicit_model_and_thinking_config():
    provider = _make_provider(model="qwen3-32b-custom", enable_thinking=True, timeout_seconds=30.0, max_output_tokens=2048)
    assert provider._model == "qwen3-32b-custom"
    assert provider._enable_thinking is True
    assert provider._timeout_seconds == 30.0
    assert provider._max_output_tokens == 2048


# --- non-thinking JSON calls -------------------------------------------


def test_non_thinking_call_returns_content(monkeypatch):
    provider = _make_provider()
    captured = {}

    def _fake_create(**kwargs):
        captured.update(kwargs)
        return _FakeResponse('{"ok": true}')

    monkeypatch.setattr(provider._client.chat.completions, "create", _fake_create)

    result = provider.complete(system_prompt="sys", user_prompt="user")
    assert result == '{"ok": true}'
    assert captured["extra_body"] == {"enable_thinking": False}
    assert "response_format" not in captured


def test_response_format_json_object_is_forwarded_when_requested(monkeypatch):
    provider = _make_provider()
    captured = {}

    def _fake_create(**kwargs):
        captured.update(kwargs)
        return _FakeResponse('{"ok": true}')

    monkeypatch.setattr(provider._client.chat.completions, "create", _fake_create)

    provider.complete(system_prompt="sys", user_prompt="user", response_format="json_object")
    assert captured["response_format"] == {"type": "json_object"}


def test_usage_and_latency_metadata_captured(monkeypatch):
    provider = _make_provider()

    def _fake_create(**kwargs):
        return _FakeResponse("hello", usage=_FakeUsage(5, 7, 12))

    monkeypatch.setattr(provider._client.chat.completions, "create", _fake_create)

    provider.complete(system_prompt="sys", user_prompt="user")
    assert provider.last_usage == {"prompt_tokens": 5, "completion_tokens": 7, "total_tokens": 12}
    assert provider.last_latency_ms is not None
    assert provider.last_latency_ms >= 0


def test_empty_model_content_raises_ai_provider_error(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider()

    def _fake_create(**kwargs):
        return _FakeResponse("")

    monkeypatch.setattr(provider._client.chat.completions, "create", _fake_create)

    with pytest.raises(AIProviderError):
        provider.complete(system_prompt="sys", user_prompt="user")


# --- thinking / streaming ------------------------------------------------


def test_thinking_enabled_streams_and_aggregates_final_content_only(monkeypatch):
    provider = _make_provider(enable_thinking=True)

    chunks = [
        _FakeStreamChunk(_FakeDelta(reasoning_content="secret internal reasoning step 1")),
        _FakeStreamChunk(_FakeDelta(reasoning_content="secret internal reasoning step 2")),
        _FakeStreamChunk(_FakeDelta(content="Final ")),
        _FakeStreamChunk(_FakeDelta(content="answer.")),
        _FakeStreamChunk(usage=_FakeUsage(1, 2, 3)),
    ]

    def _fake_create(**kwargs):
        assert kwargs["stream"] is True
        return iter(chunks)

    monkeypatch.setattr(provider._client.chat.completions, "create", _fake_create)

    result = provider.complete(system_prompt="sys", user_prompt="user")
    assert result == "Final answer."
    assert "secret internal reasoning" not in result
    assert provider.last_usage == {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}


def test_provider_never_exposes_reasoning_content_as_an_attribute(monkeypatch):
    """Hidden chain-of-thought must never be stored anywhere the caller
    (or later, persistence in Phase 2) could read it back."""
    provider = _make_provider(enable_thinking=True)

    chunks = [
        _FakeStreamChunk(_FakeDelta(reasoning_content="secret internal reasoning")),
        _FakeStreamChunk(_FakeDelta(content="Answer.")),
    ]
    monkeypatch.setattr(provider._client.chat.completions, "create", lambda **kw: iter(chunks))

    provider.complete(system_prompt="sys", user_prompt="user")

    for attr_name in dir(provider):
        if attr_name.startswith("_") and attr_name not in ("_client", "_model"):
            continue
        value = getattr(provider, attr_name, None)
        if isinstance(value, str):
            assert "secret internal reasoning" not in value


# --- error translation / retries -----------------------------------------


def test_timeout_is_translated_to_ai_provider_timeout_error(monkeypatch):
    from app.ai.errors import AIProviderTimeoutError

    provider = _make_provider()

    def _raise_timeout(**kwargs):
        raise openai.APITimeoutError(request=_fake_request())

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_timeout)

    with pytest.raises(AIProviderTimeoutError):
        provider.complete(system_prompt="sys", user_prompt="user")


def test_authentication_error_is_not_retried(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider()
    calls = {"count": 0}

    def _raise_auth_error(**kwargs):
        calls["count"] += 1
        raise openai.AuthenticationError(
            message="invalid api key: sk-qwen-super-secret-test-key",
            response=httpx.Response(401, request=_fake_request()),
            body=None,
        )

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_auth_error)
    monkeypatch.setattr("time.sleep", lambda *_: None)

    with pytest.raises(AIProviderError):
        provider.complete(system_prompt="sys", user_prompt="user")
    assert calls["count"] == 1


def test_authentication_error_message_never_leaks_the_api_key(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider()

    def _raise_auth_error(**kwargs):
        raise openai.AuthenticationError(
            message="invalid api key: sk-qwen-super-secret-test-key",
            response=httpx.Response(401, request=_fake_request()),
            body=None,
        )

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_auth_error)

    try:
        provider.complete(system_prompt="sys", user_prompt="user")
        assert False, "expected AIProviderError"
    except AIProviderError as exc:
        assert "sk-qwen-super-secret-test-key" not in str(exc)


def test_rate_limit_retries_then_succeeds(monkeypatch):
    provider = _make_provider(max_retries=3)
    calls = {"count": 0}

    def _flaky_create(**kwargs):
        calls["count"] += 1
        if calls["count"] < 3:
            raise openai.RateLimitError(
                message="rate limited",
                response=httpx.Response(429, request=_fake_request()),
                body=None,
            )
        return _FakeResponse("recovered")

    monkeypatch.setattr(provider._client.chat.completions, "create", _flaky_create)
    sleep_calls = []
    monkeypatch.setattr("time.sleep", lambda seconds: sleep_calls.append(seconds))

    result = provider.complete(system_prompt="sys", user_prompt="user")
    assert result == "recovered"
    assert calls["count"] == 3
    assert len(sleep_calls) == 2


def test_rate_limit_exhausts_retries_raises_ai_provider_error(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider(max_retries=2)

    def _always_rate_limited(**kwargs):
        raise openai.RateLimitError(
            message="rate limited",
            response=httpx.Response(429, request=_fake_request()),
            body=None,
        )

    monkeypatch.setattr(provider._client.chat.completions, "create", _always_rate_limited)
    monkeypatch.setattr("time.sleep", lambda *_: None)

    with pytest.raises(AIProviderError):
        provider.complete(system_prompt="sys", user_prompt="user")


def test_retryable_server_error_retries_then_succeeds(monkeypatch):
    provider = _make_provider(max_retries=3)
    calls = {"count": 0}

    def _flaky_create(**kwargs):
        calls["count"] += 1
        if calls["count"] < 2:
            raise openai.InternalServerError(
                message="server error",
                response=httpx.Response(503, request=_fake_request()),
                body=None,
            )
        return _FakeResponse("recovered")

    monkeypatch.setattr(provider._client.chat.completions, "create", _flaky_create)
    monkeypatch.setattr("time.sleep", lambda *_: None)

    result = provider.complete(system_prompt="sys", user_prompt="user")
    assert result == "recovered"
    assert calls["count"] == 2


def test_non_retryable_bad_request_error_is_not_retried(monkeypatch):
    from app.ai.errors import AIProviderError

    provider = _make_provider(max_retries=3)
    calls = {"count": 0}

    def _raise_bad_request(**kwargs):
        calls["count"] += 1
        raise openai.BadRequestError(
            message="invalid request",
            response=httpx.Response(400, request=_fake_request()),
            body=None,
        )

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise_bad_request)

    with pytest.raises(AIProviderError):
        provider.complete(system_prompt="sys", user_prompt="user")
    assert calls["count"] == 1
