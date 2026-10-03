"""Application configuration.

All configuration is loaded from environment variables (see
casebridge/.env.example). Nothing here should ever be hardcoded, and
this module must never log secret values.
"""
from typing import Literal, Optional

from pydantic import PositiveFloat, PositiveInt, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required
    jwt_secret: str

    # Optional / defaulted
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    database_url: str = "sqlite:///./casebridge.db"
    env: str = "development"

    # AI provider selection (Phase 1 - section 27). Explicit and
    # config-driven: no provider is ever silently substituted for
    # another. Defaults to "mock" so a fresh checkout / the default
    # automated test suite never accidentally calls a real provider.
    llm_provider: Literal["qwen", "openai", "ollama", "mock"] = "mock"

    # OpenAI (optional at startup - MVP can run entirely on mocks)
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    # Qwen3-32B via the OpenAI-compatible Alibaba Model Studio API.
    # QWEN_BASE_URL is required (never hardcoded) because Model Studio
    # endpoints differ by region/workspace.
    qwen_api_key: Optional[str] = None
    qwen_base_url: Optional[str] = None
    qwen_model: str = "qwen3-32b"
    qwen_enable_thinking: bool = False
    qwen_timeout_seconds: float = 90
    qwen_max_output_tokens: int = 8192

    # Local Ollama. Docker Compose overrides the base URL with
    # host.docker.internal; direct backend runs normally use 127.0.0.1.
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3.5:9b"
    ollama_timeout_seconds: float = 180
    ollama_temperature: float = 0.2
    ollama_num_ctx: int = 16384

    # Task-based model levels for analysis and courtroom (Basit / Standart /
    # Kapsamlı). Standart is the provider's own model (OPENAI_MODEL,
    # OLLAMA_MODEL or QWEN_MODEL); an empty level model falls back to it.
    llm_model_basic: str = ""
    llm_model_deep: str = ""

    # Chat assistant (Hukuk Asistanı). Independent of LLM_PROVIDER so the
    # chat can run on OpenAI (or a fine-tuned model) while analysis and
    # courtroom stay on the local model. Defaults to "mock" so tests never
    # call a real provider.
    chat_provider: Literal["openai", "ollama", "mock"] = "mock"
    chat_model: str = "gpt-4o-mini"
    chat_timeout_seconds: float = 60
    chat_history_limit: int = 20
    # Answer levels (Basit / Standart / Kapsamlı). CHAT_MODEL is the Standart
    # model; an empty level model falls back to CHAT_MODEL.
    chat_model_basic: str = ""
    chat_model_deep: str = ""
    # Positive so a typo like 0 can't silently remove the cap.
    chat_max_tokens_basic: PositiveInt = 500
    chat_max_tokens_standard: PositiveInt = 1500
    chat_max_tokens_deep: PositiveInt = 4000
    chat_history_limit_basic: PositiveInt = 6
    # Automatic level selection: each question is first classified by the
    # Basit model. Off -> every question uses Standart.
    chat_auto_level: bool = True
    chat_classifier_timeout_seconds: PositiveFloat = 8

    # Monthly token budget for the sidebar AI usage box. 0 = no budget set.
    ai_monthly_token_budget: int = 0

    storage_dir: str = "storage"
    # Demo cases/tasks/documents. false = seed only the firm and login users
    # and remove previously seeded demo cases (real data mode).
    seed_demo_data: bool = True
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB

    # Comma-separated list of extra allowed CORS origins (e.g. for E2E test
    # servers running on non-default ports). The default dev origins are
    # always allowed regardless of this setting.
    extra_cors_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
        extras = [origin.strip() for origin in self.extra_cors_origins.split(",") if origin.strip()]
        return defaults + extras

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_must_not_be_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("JWT_SECRET must be set and non-empty")
        return value

    @property
    def ai_enabled(self) -> bool:
        return self.llm_provider != "mock"


settings = Settings()
