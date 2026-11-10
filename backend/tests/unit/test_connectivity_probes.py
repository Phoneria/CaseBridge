"""Probe provider failures without spending tokens or leaking upstream payloads."""
import httpx
import pytest

from app.ai import connectivity


@pytest.mark.parametrize("status,expected", [
    (401, "API anahtarı geçersiz."),
    (403, "Sağlayıcı erişim izni yetersiz."),
    (429, "Sağlayıcı kullanım sınırına ulaşıldı (429)."),
    (503, "Sağlayıcı hata döndürdü (503)."),
])
def test_distinguishes_auth_permission_quota_and_provider_errors(monkeypatch, status, expected):
    monkeypatch.setattr(connectivity.httpx, "get", lambda *a, **k: httpx.Response(status, text="private-upstream-body"))
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "secret", "model") == (False, expected)


def test_missing_key_never_calls_provider(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("missing credentials must not make a network call")
    monkeypatch.setattr(connectivity.httpx, "get", unexpected)
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "  ")[0] is False


def test_checks_selected_model_access(monkeypatch):
    monkeypatch.setattr(connectivity.httpx, "get", lambda *a, **k: httpx.Response(200, json={"data": [{"id": "available"}]}))
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "secret", "available") == (True, None)
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "secret", "missing") == (False, "Seçilen modele erişilemiyor.")


@pytest.mark.parametrize("payload", [[], {"data": None}, "unexpected"])
def test_bad_payload_does_not_report_connected(monkeypatch, payload):
    monkeypatch.setattr(connectivity.httpx, "get", lambda *a, **k: httpx.Response(200, json=payload))
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "secret", "model") == (False, "Sağlayıcı geçersiz yanıt döndürdü.")


def test_timeout_has_specific_safe_guidance(monkeypatch):
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("private upstream details")
    monkeypatch.setattr(connectivity.httpx, "get", timeout)
    assert connectivity._probe_openai_compatible("https://provider.test/v1", "secret", "model") == (False, "Sağlayıcı bağlantısında zaman aşımı.")
