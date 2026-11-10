import httpx
import pytest

from app.services import ai_credentials
from app.core.config import settings


def mock_provider(monkeypatch, status=200):
    calls = []
    def respond(request):
        calls.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": settings.openai_model}, {"id": settings.chat_model}]})
        return httpx.Response(status, json={"choices": [{"message": {"content": "OK"}}], "error": {"message": "private-key-upstream"}})
    original = httpx.Client
    monkeypatch.setattr(ai_credentials.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    return calls


def test_checks_real_response_without_sending_firm_data(monkeypatch):
    calls = mock_provider(monkeypatch)
    ai_credentials.validate_key("sk-test-not-real")
    assert calls[0].url.path == "/v1/models"
    assert all(b"Reply only OK." in call.content for call in calls[1:])
    assert len(calls) == 1 + len({settings.openai_model, settings.chat_model})


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_provider_failures_are_sanitized(monkeypatch, status):
    mock_provider(monkeypatch, status)
    with pytest.raises(ai_credentials.CredentialError) as exc:
        ai_credentials.validate_key("sk-test-not-real")
    assert "private-key-upstream" not in str(exc.value)
    assert "sk-test" not in str(exc.value)
