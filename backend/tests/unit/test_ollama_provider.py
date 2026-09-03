import httpx
import pytest


def _provider():
    from app.ai.providers.ollama_provider import OllamaProvider

    return OllamaProvider("http://127.0.0.1:11434", model="qwen3.5:9b")


def test_ollama_sends_non_streaming_json_chat_and_tracks_usage(monkeypatch):
    provider = _provider()
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "message": {"content": '{"ok": true}'},
                "prompt_eval_count": 10,
                "eval_count": 4,
            }

    def fake_post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return Response()

    monkeypatch.setattr(httpx, "post", fake_post)
    assert provider.complete("system", "user", response_format="json_object") == '{"ok": true}'
    assert captured["url"].endswith("/api/chat")
    assert captured["json"]["model"] == "qwen3.5:9b"
    assert captured["json"]["stream"] is False
    assert captured["json"]["think"] is False
    assert captured["json"]["format"] == "json"
    assert provider.last_usage["total_tokens"] == 14


def test_ollama_maps_timeout_to_provider_timeout(monkeypatch):
    from app.ai.errors import AIProviderTimeoutError

    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(httpx, "post", timeout)
    with pytest.raises(AIProviderTimeoutError):
        _provider().complete("system", "user")


def test_ollama_rejects_empty_content(monkeypatch):
    from app.ai.errors import AIProviderError

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": ""}}

    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: Response())
    with pytest.raises(AIProviderError):
        _provider().complete("system", "user")
