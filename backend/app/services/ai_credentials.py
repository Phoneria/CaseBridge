"""Platform-managed OpenAI credential. Plaintext is never returned or logged."""
import logging
import os
import tempfile
import threading
from pathlib import Path

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

logger = logging.getLogger("casebridge")
OPENAI_URL = "https://api.openai.com/v1"
_rotation_lock = threading.Lock()


class CredentialError(Exception):
    """Contains only a fixed, user-safe message."""


def _cipher():
    try:
        return Fernet(settings.ai_secrets_encryption_key.encode("ascii")) if settings.ai_secrets_encryption_key else None
    except (ValueError, UnicodeError):
        return None


def _path(kind="active") -> Path:
    name = {"active": "openai-key.enc", "pending": "openai-key.pending.enc", "previous": "openai-key.previous.enc"}[kind]
    return Path(settings.storage_dir) / ".system-secrets" / name


def get_openai_api_key():
    path = _path()
    if not path.exists():
        return settings.openai_api_key
    return _read_secret(path)


def _read_secret(path):
    try:
        cipher = _cipher()
        return cipher.decrypt(path.read_bytes()).decode("utf-8") if cipher else None
    except (OSError, InvalidToken, UnicodeError):
        logger.error("Managed AI credential could not be loaded")
        return None


def key_status() -> dict:
    return {
        "configured": bool(get_openai_api_key()),
        "managed": _path().exists(),
        "pending": _path("pending").exists(),
        "can_save": _cipher() is not None and settings.llm_provider == "openai" and settings.chat_provider == "openai",
    }


def _check_response(response):
    if response.status_code == 401:
        raise CredentialError("Anahtar geçersiz veya süresi dolmuş. Yeni bir anahtar deneyin.")
    if response.status_code == 403:
        raise CredentialError("Anahtarın gerekli model erişim izni yok.")
    if response.status_code == 429:
        raise CredentialError("Kullanım sınırı veya bakiye yetersiz. OpenAI hesabınızı kontrol edin.")
    if response.status_code >= 400:
        raise CredentialError("AI bağlantı testi başarısız. Anahtar kaydedilmedi; daha sonra yeniden deneyin.")


def validate_key(api_key: str) -> None:
    """Token-free model-access check, then a tiny response test; no firm data."""
    models = {settings.openai_model, settings.chat_model}
    models.update(m for m in (settings.llm_model_basic, settings.llm_model_deep,
                              settings.chat_model_basic, settings.chat_model_deep) if m)
    try:
        with httpx.Client(timeout=15.0) as client:
            headers = {"Authorization": f"Bearer {api_key}"}
            response = client.get(f"{OPENAI_URL}/models", headers=headers)
            _check_response(response)
            available = {row["id"] for row in response.json()["data"] if isinstance(row, dict) and isinstance(row.get("id"), str)}
            if not models.issubset(available):
                raise CredentialError("Anahtar seçili AI modellerine erişemiyor. Model izinlerini kontrol edin.")
            for model in sorted(models):
                response = client.post(f"{OPENAI_URL}/chat/completions", headers=headers, json={
                    "model": model, "messages": [{"role": "user", "content": "Reply only OK."}],
                    "max_completion_tokens": 16,
                })
                _check_response(response)
                if not response.json()["choices"][0]["message"]["content"]:
                    raise CredentialError("AI yanıt üretmedi. Anahtar kaydedilmedi.")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
        raise CredentialError("AI hizmetine ulaşılamadı veya test yanıtı alınamadı. Anahtar kaydedilmedi.") from None


def _write_secret(path, api_key):
    cipher = _cipher()
    if not key_status()["can_save"] or cipher is None:
        raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
    temporary = None
    try:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(path.parent, 0o700)
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            os.fchmod(output.fileno(), 0o600)
            output.write(cipher.encrypt(api_key.encode("utf-8")))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except OSError:
        raise CredentialError("Anahtar güvenli biçimde kaydedilemedi. Mevcut bağlantı korunuyor.") from None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def save_openai_api_key(api_key: str) -> None:
    """Test and stage; never changes what any AI request currently uses."""
    if not key_status()["can_save"]:
        raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
    validate_key(api_key)
    with _rotation_lock:
        _write_secret(_path("pending"), api_key)


def activate_openai_api_key() -> None:
    with _rotation_lock:
        if not key_status()["can_save"]:
            raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
        candidate = _read_secret(_path("pending")) if _path("pending").exists() else None
        if not candidate:
            raise CredentialError("Önce bir anahtar ekleyip bağlantı testini tamamlayın.")
        validate_key(candidate)
        previous = get_openai_api_key()
        if previous:
            _write_secret(_path("previous"), previous)
        _write_secret(_path(), candidate)
        try:
            _path("pending").unlink(missing_ok=True)
        except OSError:
            logger.warning("Activated credential; pending-file cleanup requires attention")
