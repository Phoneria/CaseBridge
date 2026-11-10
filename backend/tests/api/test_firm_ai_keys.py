"""Tenant-bound credential lifecycle and consumer routing; no real API calls."""
import shutil

import pytest
from cryptography.fernet import Fernet

from app.core.config import settings
from app.services import ai_credentials as keys

KEY_A = "sk-synthetic-bureau-a-key-value"
KEY_B = "sk-synthetic-bureau-b-key-value"


@pytest.fixture()
def bureau_keys(monkeypatch):
    monkeypatch.setattr(settings, "ai_secrets_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "openai_api_key", "sk-synthetic-global-key-value")
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(keys, "validate_key", lambda key: None)
    from app.api.routes import system
    monkeypatch.setattr(system, "get_ai_connectivity", lambda **kw: {"connected": True, "checks": [], "checked_at": 1})


def test_admin_lifecycle_is_bound_to_session_not_supplied_firm(client, office, auth_headers, bureau_keys):
    a, b = office.firm_a.id, office.firm_b.id
    ah, bh = auth_headers(office.admin_a), auth_headers(office.admin_b)
    assert client.get("/system/openai-key", headers=ah).json()["configured"] is False
    staged = client.put("/system/openai-key", headers=ah, json={"api_key": KEY_A, "law_firm_id": b})
    assert staged.status_code == 200
    assert staged.json()["pending"] is True
    assert keys.get_openai_api_key(a) is None
    assert client.get("/system/openai-key", headers=bh).json()["pending"] is False
    assert client.post("/system/openai-key/activate", headers=bh).status_code == 400
    assert client.post("/system/openai-key/activate", headers=ah).status_code == 200
    assert keys.get_openai_api_key(a) == KEY_A
    assert keys.get_openai_api_key(b) is None
    assert keys.get_openai_api_key() == settings.openai_api_key
    assert client.put("/system/openai-key", headers=bh, json={"api_key": KEY_B}).status_code == 200
    assert client.post("/system/openai-key/activate", headers=bh).status_code == 200
    assert keys.get_openai_api_key(a) == KEY_A
    assert keys.get_openai_api_key(b) == KEY_B
    for headers in (ah, bh, auth_headers(office.lawyer_a1)):
        response = client.get("/system/openai-key", headers=headers)
        assert KEY_A not in response.text and KEY_B not in response.text


def test_credentials_are_encrypted_bound_and_recoverable(bureau_keys, tmp_path, monkeypatch):
    a, b = "firm-a", "firm-b"
    keys.save_openai_api_key(KEY_A, a)
    keys.activate_openai_api_key(a)
    path_a, path_b = keys._path(law_firm_id=a), keys._path(law_firm_id=b)
    assert KEY_A.encode() not in path_a.read_bytes()
    assert path_a.stat().st_mode & 0o777 == 0o600
    assert path_a.parent.stat().st_mode & 0o777 == 0o700
    path_b.parent.mkdir(parents=True)
    shutil.copyfile(path_a, path_b)
    assert keys.get_openai_api_key(b) is None  # even a copied ciphertext cannot cross firms
    original = settings.storage_dir
    backup = tmp_path / "protected-backup"
    shutil.copytree(original, backup)
    restored = tmp_path / "restored-storage"
    shutil.copytree(backup, restored)
    monkeypatch.setattr(settings, "storage_dir", str(restored))
    assert keys.get_openai_api_key(a) == KEY_A
    keys._path(law_firm_id=a).write_bytes(b"corrupt")
    assert keys.get_openai_api_key(a) is None  # never fall back to the global key


def test_failed_rotation_preserves_only_that_firms_previous_key(bureau_keys, monkeypatch):
    keys.save_openai_api_key(KEY_A, "a")
    keys.activate_openai_api_key("a")
    keys.save_openai_api_key(KEY_B, "a")
    def reject(key):
        raise keys.CredentialError("Anahtar geçersiz.")
    monkeypatch.setattr(keys, "validate_key", reject)
    with pytest.raises(keys.CredentialError):
        keys.activate_openai_api_key("a")
    assert keys.get_openai_api_key("a") == KEY_A
    assert keys.key_status("a")["pending"] is True
    assert keys.get_openai_api_key("b") is None
    monkeypatch.setattr(keys, "validate_key", lambda key: None)
    keys.activate_openai_api_key("a")
    assert keys._read_secret(keys._path("previous", "a"), "a") == KEY_A
    assert keys.get_openai_api_key("a") == KEY_B


def test_all_request_consumers_resolve_the_authenticated_firm(office, bureau_keys, monkeypatch):
    from app.api import deps
    from app.ai.chat.factory import get_chat_classifier_provider
    from app.services.voice_service import _headers
    a, b = office.firm_a.id, office.firm_b.id
    for firm, key in ((a, KEY_A), (b, KEY_B)):
        keys.save_openai_api_key(key, firm)
        keys.activate_openai_api_key(firm)
    for user, key in ((office.admin_a, KEY_A), (office.lawyer_a1, KEY_A), (office.admin_b, KEY_B)):
        firm = user.law_firm_id
        assert deps.get_llm_provider_dep(user)._standard._client.api_key == key
        assert deps.get_case_intake_provider_dep(user)._standard._client.api_key == key
        assert deps.get_chat_provider_resolver(user)("standard")._api_key == key
        assert get_chat_classifier_provider(firm)._api_key == key
        assert _headers(firm)["Authorization"] == f"Bearer {key}"
    from app.ai.chat import classifier
    monkeypatch.setattr(classifier, "classify_level", lambda provider, *args: provider._api_key)
    assert deps.get_chat_level_classifier(office.admin_a)("synthetic question") == KEY_A
    assert deps.get_chat_level_classifier(office.admin_b)("synthetic question") == KEY_B


def test_connectivity_cache_and_invalidation_are_per_firm(bureau_keys, monkeypatch):
    from app.ai import connectivity
    calls = []
    def probe(base, key, model):
        calls.append(key)
        return bool(key), None if key else "API anahtarı tanımlı değil."
    monkeypatch.setattr(connectivity, "_probe_openai_compatible", probe)
    connectivity.reset_cache()
    keys.save_openai_api_key(KEY_A, "a")
    keys.activate_openai_api_key("a")
    assert connectivity.get_ai_connectivity(law_firm_id="a")["connected"] is True
    assert connectivity.get_ai_connectivity(law_firm_id="b")["connected"] is False
    assert calls == [KEY_A, KEY_A, None, None]
    keys.save_openai_api_key(KEY_B, "b")
    keys.activate_openai_api_key("b")
    connectivity.reset_cache("b")
    assert connectivity.get_ai_connectivity(law_firm_id="b")["connected"] is True
    assert connectivity.get_ai_connectivity(law_firm_id="a")["connected"] is True
    assert calls[-2:] == [KEY_B, KEY_B]
    connectivity.reset_cache()


def test_customer_status_never_reports_shared_platform_credentials(client, office, auth_headers, bureau_keys):
    headers = auth_headers(office.admin_a)
    assert client.get("/system/ai-status", headers=headers).json()["configured"] is False
    assert client.get("/chat/status", headers=headers).json()["configured"] is False
    keys.save_openai_api_key(KEY_A, office.firm_a.id)
    keys.activate_openai_api_key(office.firm_a.id)
    assert client.get("/system/ai-status", headers=headers).json()["configured"] is True
    assert client.get("/chat/status", headers=headers).json()["configured"] is True
