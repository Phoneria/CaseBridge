import json
import logging
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.services import ai_credentials, platform_service

KEY = "sk-test-replacement-secret-value"


@pytest.fixture()
def operator(db_session, office, auth_headers, monkeypatch):
    firm = platform_service.get_or_create_platform_firm(db_session)
    user = User(law_firm_id=firm.id, email="keys@platform.example.com", full_name="Operator", role=UserRole.ADMIN,
                is_platform_admin=True, hashed_password=hash_password(office.password))
    db_session.add(user)
    db_session.commit()
    monkeypatch.setattr(settings, "ai_secrets_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(ai_credentials, "validate_key", lambda key: None)
    from app.api.routes import system
    monkeypatch.setattr(system, "get_ai_connectivity", lambda *a, **k: {"connected": True, "checks": [], "checked_at": 1})
    return SimpleNamespace(user=user, headers=auth_headers(user))


def test_admins_manage_their_scope_and_lawyers_cannot_change_key(client, office, operator, auth_headers):
    for method, path in (("get", "/system/openai-key"), ("put", "/system/openai-key"), ("post", "/system/openai-key/activate")):
        assert getattr(client, method)(path).status_code == 401
        for user in (office.lawyer_a1,):
            response = getattr(client, method)(path, headers=auth_headers(user))
            assert response.status_code == (200 if method == "get" else 403)


def test_rotates_key_encrypted_and_never_returns_or_logs_secret(client, operator, monkeypatch, caplog):
    monkeypatch.setattr(settings, "openai_api_key", "sk-old-environment-key")
    with caplog.at_level(logging.INFO):
        response = client.put("/system/openai-key", headers=operator.headers, json={"api_key": KEY})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert KEY not in response.text + caplog.text
    assert response.json()["pending"] is True
    assert ai_credentials.get_openai_api_key() == "sk-old-environment-key"
    activated = client.post("/system/openai-key/activate", headers=operator.headers)
    assert activated.status_code == 200
    assert KEY not in activated.text
    assert ai_credentials._read_secret(ai_credentials._path("previous")) == "sk-old-environment-key"
    path = ai_credentials._path()
    assert KEY.encode() not in path.read_bytes()
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.parent.stat().st_mode & 0o777 == 0o700
    assert ai_credentials.get_openai_api_key() == KEY
    status = client.get("/system/openai-key", headers=operator.headers)
    assert status.json() == {"configured": True, "managed": True, "pending": False, "can_save": True}
    assert KEY not in status.text
    # Each real consumer resolves the replacement, rather than a stale env key.
    from app.ai.chat.factory import get_chat_provider
    from app.services.voice_service import _headers
    assert get_chat_provider()._api_key == KEY
    assert _headers()["Authorization"] == f"Bearer {KEY}"


def test_invalid_replacement_preserves_previous_key(client, operator, monkeypatch):
    ai_credentials.save_openai_api_key(KEY)
    ai_credentials.activate_openai_api_key()
    def reject(key):
        raise ai_credentials.CredentialError("Anahtar geçersiz veya süresi dolmuş. Yeni bir anahtar deneyin.")
    monkeypatch.setattr(ai_credentials, "validate_key", reject)
    response = client.put("/system/openai-key", headers=operator.headers, json={"api_key": "sk-invalid-new-secret-value"})
    assert response.status_code == 400
    assert "sk-invalid" not in response.text
    assert ai_credentials.get_openai_api_key() == KEY


@pytest.mark.parametrize("payload", [{"api_key": "sk-secret"}, {"api_key": [KEY]}, [KEY], {"api_key": KEY + " space"}])
def test_bad_inputs_are_not_echoed(client, operator, payload):
    response = client.put("/system/openai-key", headers=operator.headers, json=payload)
    assert response.status_code == 400
    assert "sk-" not in response.text
    assert not ai_credentials._path().exists()


def test_missing_encryption_key_disables_save(client, operator, monkeypatch):
    monkeypatch.setattr(settings, "ai_secrets_encryption_key", "")
    response = client.put("/system/openai-key", headers=operator.headers, json={"api_key": KEY})
    assert response.status_code == 503
    assert not ai_credentials._path().exists()


def test_broken_ciphertext_never_falls_back_to_old_environment_key(client, operator, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "sk-old-environment-key")
    ai_credentials.save_openai_api_key(KEY)
    ai_credentials.activate_openai_api_key()
    ai_credentials._path().write_bytes(b"broken")
    assert ai_credentials.get_openai_api_key() is None


def test_rotation_is_rate_limited(client, operator):
    for _ in range(5):
        assert client.put("/system/openai-key", headers=operator.headers, json={"api_key": "invalid"}).status_code == 400
    assert client.put("/system/openai-key", headers=operator.headers, json={"api_key": KEY}).status_code == 429


def test_oversized_request_is_rejected_without_reflecting_secret(client, operator):
    response = client.put("/system/openai-key", headers=operator.headers, content=json.dumps({"api_key": KEY * 200}))
    assert response.status_code == 413
    assert KEY not in response.text


def test_failed_activation_keeps_active_key_and_pending_candidate(client, operator, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "sk-current-environment-key")
    ai_credentials.save_openai_api_key(KEY)
    def reject(key):
        raise ai_credentials.CredentialError("Anahtar geçersiz veya süresi dolmuş.")
    monkeypatch.setattr(ai_credentials, "validate_key", reject)
    response = client.post("/system/openai-key/activate", headers=operator.headers)
    assert response.status_code == 400
    assert ai_credentials.get_openai_api_key() == "sk-current-environment-key"
    assert ai_credentials._path("pending").exists()


def test_activation_requires_a_staged_key(client, operator):
    assert client.post("/system/openai-key/activate", headers=operator.headers).status_code == 400
    assert not ai_credentials._path().exists()
