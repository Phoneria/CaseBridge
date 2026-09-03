"""API key security (section 11, 22 - AI Configuration)."""
import logging


def test_openai_api_key_loads_from_environment(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "s")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-from-env-test")
    # ai_enabled now reflects the explicit LLM_PROVIDER selection
    # (Phase 1 migration - see IMPLEMENTATION_LOG.md), not mere presence
    # of a provider-specific key.
    monkeypatch.setenv("LLM_PROVIDER", "openai")

    from app.core.config import Settings

    settings = Settings()
    assert settings.openai_api_key == "sk-from-env-test"
    assert settings.ai_enabled is True


def test_health_endpoint_never_exposes_api_key(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "openai_api_key", "sk-should-never-appear")
    response = client.get("/health")
    assert "sk-should-never-appear" not in response.text


def test_provider_error_message_never_logged_with_key(monkeypatch, caplog):
    import httpx
    import openai

    from app.ai.providers.openai_provider import OpenAIProvider
    from app.ai.errors import AIProviderError

    provider = OpenAIProvider(api_key="sk-must-not-leak", model="gpt-4o-mini")
    fake_request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def _raise(*args, **kwargs):
        raise openai.APIConnectionError(request=fake_request)

    monkeypatch.setattr(provider._client.chat.completions, "create", _raise)

    with caplog.at_level(logging.WARNING):
        try:
            provider.complete(system_prompt="sys", user_prompt="user")
        except AIProviderError:
            pass

    for record in caplog.records:
        assert "sk-must-not-leak" not in record.getMessage()
