"""Live AI connectivity probe for the sidebar status dot.

Unlike get_ai_provider_status() (config only), this actually reaches each
configured real provider with a cheap, token-free request: Ollama
/api/tags (and checks the model is pulled), OpenAI-compatible /models.
Results are cached briefly so polling clients don't hammer providers.
Never raises and never returns secret values.
"""
import threading
import time
from typing import Optional

import httpx

from app.core.config import settings

PROBE_TIMEOUT_SECONDS = 4.0
CACHE_TTL_SECONDS = 20.0
OPENAI_BASE_URL = "https://api.openai.com/v1"

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "value": None}


def _probe_ollama(model: str) -> tuple[bool, Optional[str]]:
    base = (settings.ollama_base_url or "").rstrip("/")
    if not base:
        return False, "OLLAMA_BASE_URL tanımlı değil."
    try:
        response = httpx.get(f"{base}/api/tags", timeout=PROBE_TIMEOUT_SECONDS)
        response.raise_for_status()
        names = {m.get("name") for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError):
        return False, "Ollama sunucusuna ulaşılamadı."
    if model and model not in names and f"{model}:latest" not in names:
        return False, f"Ollama çalışıyor ama '{model}' modeli yüklü değil."
    return True, None


def _probe_openai_compatible(base_url: Optional[str], api_key: Optional[str]) -> tuple[bool, Optional[str]]:
    if not api_key or not api_key.strip():
        return False, "API anahtarı tanımlı değil."
    if not base_url or not base_url.strip():
        return False, "Base URL tanımlı değil."
    try:
        response = httpx.get(
            f"{base_url.rstrip('/')}/models",
            headers={"Authorization": f"Bearer {api_key.strip()}"},
            timeout=PROBE_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError:
        return False, "Sağlayıcıya ulaşılamadı."
    if response.status_code in (401, 403):
        return False, "API anahtarı geçersiz."
    if response.status_code >= 400:
        return False, f"Sağlayıcı hata döndürdü ({response.status_code})."
    return True, None


def _probe(provider: str, model: str) -> tuple[bool, Optional[str]]:
    if provider == "mock":
        return False, "Mock mod: gerçek bir AI sağlayıcısı yok."
    if provider == "ollama":
        return _probe_ollama(model)
    if provider == "openai":
        return _probe_openai_compatible(OPENAI_BASE_URL, settings.openai_api_key)
    if provider == "qwen":
        return _probe_openai_compatible(settings.qwen_base_url, settings.qwen_api_key)
    return False, f"Bilinmeyen sağlayıcı: {provider}"


def _llm_model() -> str:
    return {
        "qwen": settings.qwen_model,
        "openai": settings.openai_model,
        "ollama": settings.ollama_model,
    }.get(settings.llm_provider, "mock")


def _compute() -> dict:
    targets = [
        ("Analiz", settings.llm_provider, _llm_model()),
        ("Hukuk Asistanı", settings.chat_provider, settings.chat_model),
    ]
    checks = []
    for name, provider, model in targets:
        reachable, detail = _probe(provider, model)
        checks.append(
            {"name": name, "provider": provider, "model": model, "reachable": reachable, "detail": detail}
        )
    return {
        "connected": all(c["reachable"] for c in checks),
        "checks": checks,
        "checked_at": time.time(),
    }


def get_ai_connectivity(force: bool = False) -> dict:
    with _lock:
        cached = _cache["value"]
        if not force and cached is not None and time.monotonic() - _cache["at"] < CACHE_TTL_SECONDS:
            return cached
    value = _compute()
    with _lock:
        _cache["value"] = value
        _cache["at"] = time.monotonic()
    return value


def reset_cache() -> None:
    with _lock:
        _cache["value"] = None
        _cache["at"] = 0.0
