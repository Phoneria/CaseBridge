"""Legal lab: mock mode works without a key, tenant scoping, AI path and graceful fallback."""
import json

from app.ai.errors import AIProviderError
from app.ai.providers.base import LLMProvider
from app.api.deps import get_current_user  # noqa: F401
from app.api.routes.legal_lab import get_optional_provider
from app.main import app
from app.models.case import Case, CaseType


def _headers(client, user, password):
    token = client.post("/auth/login", json={"email": user.email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class _Fake(LLMProvider):
    def __init__(self, payload=None, boom=False):
        self.payload, self.boom, self.calls = payload, boom, 0

    def complete(self, system_prompt, user_prompt, *, response_format=None):
        self.calls += 1
        if self.boom:
            raise AIProviderError("down")
        return json.dumps(self.payload, ensure_ascii=False)


def test_requires_login(client):
    assert client.get("/legal-lab/map").status_code == 401
    assert client.post("/legal-lab/counter-analysis", json={"summary": "x"}).status_code == 401


def test_map_and_status_in_mock_mode(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    g = client.get("/legal-lab/map", headers=h).json()
    assert len(g["nodes"]) == 180 and g["nodes"][0]["code"]
    st = client.get("/legal-lab/status", headers=h).json()
    assert st["mode"] == "mock" and st["note"]


def test_counter_analysis_mock_has_real_graph_trends(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    r = client.post("/legal-lab/counter-analysis", json={"summary": "Kısa özet"}, headers=h).json()
    assert r["mode"] == "mock" and r["note"]
    assert len(r["findings"]) >= 5
    hmk190 = next(b for x in r["findings"] for b in x["basis"] if b["code"] == "HMK m.190")
    assert hmk190["trend"]["n"] >= 30


def test_case_is_firm_scoped(client, db_session, two_firms_two_users):
    f = two_firms_two_users
    case = Case(law_firm_id=f["firm_b"].id, case_number="2026/9", case_name="B Davası", client_name="X",
                case_type=CaseType.SOZLESME, assigned_lawyer_id=f["user_b"].id)
    db_session.add(case)
    db_session.commit()
    h = _headers(client, f["user_a"], f["password"])
    assert client.post("/legal-lab/counter-analysis", json={"case_id": case.id}, headers=h).status_code == 404
    hb = _headers(client, f["user_b"], f["password"])
    assert client.post("/legal-lab/counter-analysis", json={"case_id": case.id}, headers=hb).status_code == 200


def test_trial_mock_flow_with_direction_and_verdict(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    base = {"summary": "Özet", "side": "davaci", "stage_idx": 0, "transcript": [], "manual": []}
    r = client.post("/legal-lab/trial/beat", json=base, headers=h).json()
    assert r["mode"] == "mock" and {t["who"] for t in r["turns"]} >= {"davaci", "davali"} and r["stage_done"]
    iv = {**base, "interv": {"mode": "direct", "target": "hakim", "text": "Delilleri sor"}}
    r = client.post("/legal-lab/trial/beat", json=iv, headers=h).json()
    assert r["turns"][0]["who"] == "hakim" and r["turns"][0]["text"] == "Delilleri sor"
    order = client.post("/legal-lab/trial/beat", json={**base, "interv": {"mode": "order", "target": "hakim", "text": "Belgeleri sun"}}, headers=h).json()
    assert order["turns"][0]["who"] == "davaci"
    last = client.post("/legal-lab/trial/beat", json={**base, "stage_idx": 4}, headers=h).json()
    assert last["karar"] and last["finished"]
    judge = client.post("/legal-lab/trial/beat", json={**base, "side": "hakim", "stage_idx": 4,
                        "interv": {"mode": "hukum", "text": "gerekçe", "sonuc": "red"}}, headers=h).json()
    assert judge["karar"]["sonuc"] == "red"


def test_guides_and_ask_mock(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    for role in ("hakim", "davaci", "davali"):
        g = client.post("/legal-lab/trial/guide", json={"summary": "x", "role": role}, headers=h).json()
        assert g["role"] == role and g["mode"] == "mock"
    assert client.post("/legal-lab/trial/ask", json={"summary": "x", "question": "ne yapayım?"}, headers=h).json()["answer"]


def test_real_provider_is_used_and_codes_are_filtered(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    fake = _Fake({"findings": [{"title": "T", "type": "risk", "severity": 4, "stage": "delil", "fact": "Dosyada bilgi yok: x",
                                "rule": "r", "inference": "i", "basis": ["HMK m.190", "UYDURMA m.999"], "action": "a"}]})
    app.dependency_overrides[get_optional_provider] = lambda: fake
    try:
        r = client.post("/legal-lab/counter-analysis", json={"summary": "özet ispat delil"}, headers=h).json()
    finally:
        app.dependency_overrides.pop(get_optional_provider, None)
    assert r["mode"] == "ai" and r["note"] is None and fake.calls == 1
    assert [b["code"] for b in r["findings"][0]["basis"]] in ([], ["HMK m.190"])
    assert all(b["code"] != "UYDURMA m.999" for b in r["findings"][0]["basis"])


def test_provider_failure_falls_back_to_mock(client, two_firms_two_users):
    f = two_firms_two_users
    h = _headers(client, f["user_a"], f["password"])
    app.dependency_overrides[get_optional_provider] = lambda: _Fake(boom=True)
    try:
        r = client.post("/legal-lab/trial/beat", json={"summary": "x", "side": "davaci", "stage_idx": 1}, headers=h)
    finally:
        app.dependency_overrides.pop(get_optional_provider, None)
    assert r.status_code == 200 and r.json()["mode"] == "mock" and "alınamadı" in r.json()["note"]
