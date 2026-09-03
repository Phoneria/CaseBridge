"""Security headers (Phase 6): baseline hardening headers on every
response - not a substitute for a real WAF/CDN in production, but
closes the cheapest, most obvious gaps for a demo-ready backend."""


def test_response_includes_security_headers(client):
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "permissions-policy" in response.headers
