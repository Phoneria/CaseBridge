"""Backend health endpoint responds (section 22 - Application)."""


def test_health_endpoint_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_health_endpoint_reports_app_name(client):
    response = client.get("/health")
    assert response.json()["app"] == "casebridge"


def test_public_release_identity_contains_only_valid_nonsecret_metadata(client, monkeypatch):
    monkeypatch.setenv('CASEBRIDGE_RELEASE_COMMIT', 'a' * 40)
    monkeypatch.setenv('CASEBRIDGE_APP_VERSION', '0.20')
    assert client.get('/health').json() == {'status': 'ok', 'app': 'casebridge', 'release_commit': 'a' * 40, 'application_version': '0.20'}
    monkeypatch.setenv('CASEBRIDGE_RELEASE_COMMIT', 'invalid-untrusted-value')
    monkeypatch.setenv('CASEBRIDGE_APP_VERSION', 'invalid-untrusted-value')
    assert client.get('/health').json() == {'status': 'ok', 'app': 'casebridge'}
