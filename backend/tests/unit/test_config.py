"""Required configuration loads correctly / missing configuration fails
gracefully (section 22 - Application)."""
import pytest


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db")

    from app.core.config import Settings

    settings = Settings()
    assert settings.jwt_secret == "some-secret"
    assert settings.database_url == "sqlite:///./x.db"


def test_missing_openai_key_is_tolerated(monkeypatch):
    """AI is optional at startup: no key means AI features are disabled,
    not a crash."""
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    from app.core.config import Settings

    settings = Settings()
    assert settings.openai_api_key in (None, "")
    assert settings.ai_enabled is False


def test_cors_origins_defaults_to_local_dev_frontend(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.delenv("EXTRA_CORS_ORIGINS", raising=False)

    from app.core.config import Settings

    settings = Settings()
    assert "http://localhost:3000" in settings.cors_origins
    assert "http://127.0.0.1:3000" in settings.cors_origins


def test_cors_origins_includes_configured_extras(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("EXTRA_CORS_ORIGINS", "http://127.0.0.1:3010, http://127.0.0.1:3011")

    from app.core.config import Settings

    settings = Settings()
    assert "http://127.0.0.1:3010" in settings.cors_origins
    assert "http://127.0.0.1:3011" in settings.cors_origins
    assert "http://localhost:3000" in settings.cors_origins


def test_missing_jwt_secret_fails_gracefully(monkeypatch):
    """A required security setting missing must raise a clear, specific
    error rather than failing deep inside unrelated code."""
    monkeypatch.delenv("JWT_SECRET", raising=False)

    from app.core.config import Settings
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret=None)


def test_llm_provider_defaults_to_mock(monkeypatch):
    """Safety default: automated tests / a fresh checkout with no
    LLM_PROVIDER set must never accidentally try a real provider."""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    from app.core.config import Settings

    settings = Settings(_env_file=None, jwt_secret="x")
    assert settings.llm_provider == "mock"


def test_qwen_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("LLM_PROVIDER", "qwen")
    monkeypatch.setenv("QWEN_API_KEY", "sk-qwen-test")
    monkeypatch.setenv("QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setenv("QWEN_MODEL", "qwen3-32b")
    monkeypatch.setenv("QWEN_ENABLE_THINKING", "false")
    monkeypatch.setenv("QWEN_TIMEOUT_SECONDS", "90")
    monkeypatch.setenv("QWEN_MAX_OUTPUT_TOKENS", "8192")

    from app.core.config import Settings

    settings = Settings()
    assert settings.llm_provider == "qwen"
    assert settings.qwen_api_key == "sk-qwen-test"
    assert settings.qwen_base_url == "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    assert settings.qwen_model == "qwen3-32b"
    assert settings.qwen_enable_thinking is False
    assert settings.qwen_timeout_seconds == 90
    assert settings.qwen_max_output_tokens == 8192


def test_qwen_model_defaults_to_qwen3_32b(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.delenv("QWEN_MODEL", raising=False)

    from app.core.config import Settings

    settings = Settings()
    assert settings.qwen_model == "qwen3-32b"


def test_qwen_enable_thinking_defaults_to_false(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.delenv("QWEN_ENABLE_THINKING", raising=False)

    from app.core.config import Settings

    settings = Settings()
    assert settings.qwen_enable_thinking is False


def test_invalid_llm_provider_value_is_rejected(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")

    from app.core.config import Settings
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.parametrize(
    "name", ["CHAT_MAX_TOKENS_BASIC", "CHAT_MAX_TOKENS_STANDARD", "CHAT_MAX_TOKENS_DEEP", "CHAT_HISTORY_LIMIT_BASIC"]
)
def test_chat_level_limits_must_be_positive(monkeypatch, name):
    monkeypatch.setenv(name, "0")

    from app.core.config import Settings
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret="x")
