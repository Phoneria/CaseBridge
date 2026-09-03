"""Backend health endpoint responds (section 22 - Application)."""


def test_health_endpoint_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_health_endpoint_reports_app_name(client):
    response = client.get("/health")
    assert response.json()["app"] == "casebridge"
