"""Encrypted OpenAI credentials isolated by authenticated law firm."""
import hashlib
import json
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


def _path(kind="active", law_firm_id=None) -> Path:
    name = {"active": "openai-key.enc", "pending": "openai-key.pending.enc", "previous": "openai-key.previous.enc"}[kind]
    root = Path(settings.storage_dir) / ".system-secrets"
    if law_firm_id is not None:
        root = root / "firms" / hashlib.sha256(law_firm_id.encode()).hexdigest()
    return root / name


def get_openai_api_key(law_firm_id=None):
    path = _path(law_firm_id=law_firm_id)
    if not path.exists():
        return settings.openai_api_key if law_firm_id is None else None
    return _read_secret(path, law_firm_id)


def _read_secret(path, law_firm_id=None):
    try:
        cipher = _cipher()
        plaintext = cipher.decrypt(path.read_bytes()).decode("utf-8") if cipher else None
        if law_firm_id is None:
            return plaintext
        envelope = json.loads(plaintext) if plaintext else {}
        return envelope.get("key") if envelope.get("firm") == law_firm_id else None
    except (OSError, InvalidToken, UnicodeError, ValueError, AttributeError):
        logger.error("Managed AI credential could not be loaded")
        return None


def key_status(law_firm_id=None) -> dict:
    return {
        "configured": bool(get_openai_api_key(law_firm_id)),
        "managed": _path(law_firm_id=law_firm_id).exists(),
        "pending": _path("pending", law_firm_id).exists(),
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


def _write_secret(path, api_key, law_firm_id=None):
    cipher = _cipher()
    if not key_status()["can_save"] or cipher is None:
        raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
    temporary = None
    try:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        root = Path(settings.storage_dir) / ".system-secrets"
        for directory in (root, path.parent, path.parent.parent):
            if directory == root or root in directory.parents:
                os.chmod(directory, 0o700)
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            os.fchmod(output.fileno(), 0o600)
            plaintext = api_key if law_firm_id is None else json.dumps({"firm": law_firm_id, "key": api_key})
            output.write(cipher.encrypt(plaintext.encode("utf-8")))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except OSError:
        raise CredentialError("Anahtar güvenli biçimde kaydedilemedi. Mevcut bağlantı korunuyor.") from None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def save_openai_api_key(api_key: str, law_firm_id=None) -> None:
    """Test and stage; never changes what any AI request currently uses."""
    if not key_status()["can_save"]:
        raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
    validate_key(api_key)
    with _rotation_lock:
        _write_secret(_path("pending", law_firm_id), api_key, law_firm_id)


def activate_openai_api_key(law_firm_id=None) -> None:
    with _rotation_lock:
        if not key_status()["can_save"]:
            raise CredentialError("Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
        pending = _path("pending", law_firm_id)
        candidate = _read_secret(pending, law_firm_id) if pending.exists() else None
        if not candidate:
            raise CredentialError("Önce bir anahtar ekleyip bağlantı testini tamamlayın.")
        validate_key(candidate)
        previous = get_openai_api_key(law_firm_id)
        if previous:
            _write_secret(_path("previous", law_firm_id), previous, law_firm_id)
        _write_secret(_path(law_firm_id=law_firm_id), candidate, law_firm_id)
        try:
            pending.unlink(missing_ok=True)
        except OSError:
            logger.warning("Activated credential; pending-file cleanup requires attention")
