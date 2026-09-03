"""Application starts successfully (section 22 - Application)."""


def test_app_imports_and_has_routes():
    from app.main import app

    assert app is not None
    route_paths = {route.path for route in app.routes}
    assert "/health" in route_paths


def test_app_title_is_casebridge():
    from app.main import app

    assert app.title == "CaseBridge"
