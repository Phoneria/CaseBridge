"""Stage 3 of "Benzer Davalar" (specs/019-similar-precedents): filters, summary, details and the
optional AI explanation. Every LLM call uses MockProvider."""
import time
from datetime import date

import pytest

from app.ai.providers.mock_provider import MockProvider
from app.api.deps import get_similarity_llm_provider
from app.core.config import settings
from app.main import app
from app.models.case import CaseEvent, CaseEventType, CaseOutcome, CaseType
from app.services.similarity_service import CACHE
from tests.api.test_similar_precedents import _case, _document, _precedent

TEXT = dict(
    claim="Kira bedelinin tespiti ve ödenmeyen kira farkının tahsili; TBK 344 uyarınca uyarlama.",
    facts_summary="Kiracı yeni dönem kira bedelini eski bedel üzerinden ödedi. Kiraya veren ihtarname gönderdi.",
)


@pytest.fixture(autouse=True)
def _fresh():
    CACHE.invalidate()
    yield
    CACHE.invalidate()
    app.dependency_overrides.pop(get_similarity_llm_provider, None)


def _event(db, case, when, kind, title, firm_id=None):
    db.add(CaseEvent(case_id=case.id, law_firm_id=firm_id or case.law_firm_id, event_date=when,
                     event_type=kind, title=title))
    db.commit()


@pytest.fixture()
def bureau(db_session, office):
    db, a, b = db_session, office.firm_a, office.firm_b
    source = _case(db, a, "2026/40", "Kira tespit davası", court="İstanbul 14. Sulh Hukuk Mahkemesi",
                   case_value=120000, client_role="plaintiff", **TEXT)
    won = _precedent(
        db, a, "2023/5", "Kira tespiti kabul", court="Ankara 2. Sulh Hukuk Mahkemesi", client_role="defendant",
        opening_date=date(2023, 1, 10), decision_date=date(2024, 3, 10), case_value=100000,
        outcome=CaseOutcome.WON,
        claim="Kira bedelinin tespiti istemi; TBK 344.",
        facts_summary="Kiracı yeni dönem kira bedelini ödemedi. Bilirkişi raporu ile emsal kira bedeli belirlendi. "
                      "Tanık beyanları dinlendi.",
    )
    lost = _precedent(
        db, a, "2022/9", "Kira tespiti ret", court="İzmir 3. Asliye Hukuk Mahkemesi",
        opening_date=date(2022, 1, 1), decision_date=date(2022, 7, 1), case_value=900000,
        outcome=CaseOutcome.LOST,
        claim="Kira bedelinin tespiti; TBK 344.", facts_summary="Kiracı kira bedelini ödedi; ihtarname tebliğ edilmedi.",
    )
    no_dates = _precedent(
        db, a, "2021/3", "Kira farkı sulh", court="Ankara 2. Sulh Hukuk Mahkemesi", outcome=CaseOutcome.SETTLED,
        claim="Kira farkının tahsili.", facts_summary="Taraflar kira bedeli konusunda sulh oldu.",
    )
    _event(db, won, date(2023, 6, 1), CaseEventType.EXPERT_REPORT, "Bilirkişi raporu alındı")
    _event(db, won, date(2023, 1, 10), CaseEventType.FILING, "Dava açıldı")
    _event(db, won, date(2023, 3, 2), CaseEventType.HEARING, "Ön inceleme duruşması")
    # A row stamped with another bureau must never reach firm A's timeline.
    _event(db, won, date(2023, 4, 1), CaseEventType.NOTE, "Yabancı büro notu", firm_id=b.id)
    _document(db, won, "rapor.txt", "Bilirkişi raporu: emsal kira bedeli aylık 9.000 TL.")
    foreign = _precedent(db, b, "2023/5", "Kira tespiti kabul", court="Ankara 2. Sulh Hukuk Mahkemesi",
                         opening_date=date(2020, 1, 1), decision_date=date(2020, 2, 1), case_value=5,
                         outcome=CaseOutcome.LOST, **TEXT)
    _event(db, foreign, date(2020, 1, 5), CaseEventType.FILING, "B bürosu dava açıldı")
    return dict(source=source, won=won, lost=lost, no_dates=no_dates, foreign=foreign)


def _get(client, headers, case_id, **params):
    params.setdefault("limit", 20)
    return client.get(f"/cases/{case_id}/similar-precedents", params=params, headers=headers)


def test_summary_counts_outcomes_and_averages_only_stored_values(client, office, auth_headers, bureau):
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id).json()
    summary = body["summary"]
    ids = {r["precedent_id"] for r in body["items"]}
    assert ids == {bureau["won"].id, bureau["lost"].id, bureau["no_dates"].id}
    assert summary["count"] == 3
    assert summary["outcomes"] == {"won": 1, "lost": 1, "settled": 1}
    # 14 months (2023-01-10 -> 2024-03-10) and 6 months; the undated precedent is left out.
    assert summary["duration_count"] == 2 and summary["avg_duration_months"] == pytest.approx(9.9, abs=0.2)
    assert summary["value_count"] == 2 and summary["avg_case_value"] == 500000
    assert summary["available_courts"] == ["Ankara 2. Sulh Hukuk Mahkemesi", "İzmir 3. Asliye Hukuk Mahkemesi"]
    assert summary["excluded_signals"] == []


def test_summary_has_no_averages_without_data(client, office, auth_headers, db_session):
    a = office.firm_a
    source = _case(db_session, a, "2026/41", "Kira davası", **TEXT)
    _precedent(db_session, a, "2020/1", "Kira emsali", **TEXT)
    summary = _get(client, auth_headers(office.admin_a), source.id).json()["summary"]
    assert summary["count"] == 1
    assert summary["avg_duration_months"] is None and summary["avg_case_value"] is None
    assert summary["duration_count"] == 0 and summary["value_count"] == 0
    assert "Mahkeme" in summary["excluded_signals"]


def test_filters_by_outcome_court_and_min_score(client, office, auth_headers, bureau):
    headers, case_id = auth_headers(office.admin_a), bureau["source"].id
    body = _get(client, headers, case_id, outcome=["won", "settled"]).json()
    assert {r["outcome"] for r in body["items"]} == {"won", "settled"}
    assert body["summary"]["count"] == 2 and "lost" not in body["summary"]["outcomes"]
    # The court list stays the unfiltered one so the filter can be changed back.
    assert len(body["summary"]["available_courts"]) == 2

    body = _get(client, headers, case_id, court="ankara 2. sulh hukuk mahkemesi").json()
    assert {r["precedent_id"] for r in body["items"]} == {bureau["won"].id, bureau["no_dates"].id}

    scores = sorted(r["score"] for r in _get(client, headers, case_id).json()["items"])
    body = _get(client, headers, case_id, min_score=scores[-1]).json()
    assert body["items"] and all(r["score"] >= scores[-1] for r in body["items"])
    assert body["summary"]["count"] == len(body["items"])

    assert _get(client, headers, case_id, min_score=101).status_code == 422
    assert _get(client, headers, case_id, outcome="unknown").status_code == 422


def test_limit_applies_to_items_not_to_the_summary(client, office, auth_headers, bureau):
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id, limit=1).json()
    assert len(body["items"]) == 1 and body["summary"]["count"] == 3


def test_item_details_value_duration_breakdown_timeline_and_differences(client, office, auth_headers, bureau):
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id).json()
    won = next(r for r in body["items"] if r["precedent_id"] == bureau["won"].id)
    assert won["case_value"] == 100000
    assert won["duration_months"] == pytest.approx(14.0, abs=0.1)
    # The breakdown adds up to the score (rounding aside) and never exceeds each signal's maximum.
    parts = won["score_breakdown"]
    assert [p["key"] for p in parts] == ["text", "case_type", "court", "statutes"]
    assert sum(p["points"] for p in parts) == pytest.approx(won["score"], abs=1.0)
    assert all(0 <= p["points"] <= p["max_points"] for p in parts)
    assert sum(p["max_points"] for p in parts) == pytest.approx(100, abs=0.5)
    # Ordered events of this bureau only.
    assert [(e["event_date"], e["event_type"], e["title"]) for e in won["timeline"]] == [
        ("2023-01-10", "filing", "Dava açıldı"),
        ("2023-03-02", "hearing", "Ön inceleme duruşması"),
        ("2023-06-01", "expert_report", "Bilirkişi raporu alındı"),
    ]
    differences = {d["label"]: (d["case_value"], d["precedent_value"]) for d in won["key_differences"]}
    assert differences["Müvekkil rolü"] == ("Davacı", "Davalı")
    assert differences["Bilirkişi raporu"] == ("Yok", "Var")
    assert differences["Yüklenen belge"] == ("Belge yok", "1 belge")
    assert "Tanık beyanı" in differences["Delil türleri"][1]
    assert "İhtarname" in differences["Delil türleri"][0]
    assert won["facts"]["has_expert_report"] is True and won["facts"]["client_role"] == "defendant"
    assert body["source"]["client_role"] == "plaintiff" and body["source"]["has_expert_report"] is False

    lost = next(r for r in body["items"] if r["precedent_id"] == bureau["lost"].id)
    differences = {d["label"]: d for d in lost["key_differences"]}
    assert differences["Mahkeme türü"]["precedent_value"] == "Asliye Hukuk"
    assert differences["Dava değeri"]["precedent_value"] == "900.000 TL"
    assert "Müvekkil rolü" not in differences  # not stored on the precedent: no rule fires
    assert lost["timeline"] == [] and lost["ai_explanation"] is None


def test_details_never_include_another_bureaus_rows(client, office, auth_headers, bureau):
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id).json()
    flat = str(body)
    assert bureau["foreign"].id not in flat
    assert "Yabancı büro notu" not in flat and "B bürosu" not in flat
    # Asking for the other bureau's precedent by id gives nothing.
    other = _get(client, auth_headers(office.admin_a), bureau["source"].id, precedent_id=bureau["foreign"].id).json()
    assert other["items"] == [] and other["summary"]["count"] == 0
    # Firm B sees only its own precedent, its own timeline and its own summary.
    own = _case(_session(bureau), office.firm_b, "2026/1", "Kira tespit davası", **TEXT)
    body_b = _get(client, auth_headers(office.lawyer_b), own.id).json()
    assert [r["precedent_id"] for r in body_b["items"]] == [bureau["foreign"].id]
    assert [e["title"] for e in body_b["items"][0]["timeline"]] == ["B bürosu dava açıldı"]
    assert body_b["summary"]["count"] == 1 and body_b["summary"]["outcomes"] == {"lost": 1}


def _session(bureau):
    from sqlalchemy.orm import object_session
    return object_session(bureau["source"])


# --- Optional AI explanation ------------------------------------------------------------

def _use(provider):
    app.dependency_overrides[get_similarity_llm_provider] = lambda: (lambda: provider)


def test_explain_off_by_default_and_never_calls_the_provider(client, office, auth_headers, bureau):
    provider = MockProvider(default_response="Açıklama")
    _use(provider)
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id).json()
    assert all(r["ai_explanation"] is None for r in body["items"])
    assert provider.calls == []


def test_explain_uses_only_the_two_texts(client, office, auth_headers, bureau):
    provider = MockProvider(default_response="İki dosya da kira bedelinin tespiti ve TBK 344 ile ilgilidir.")
    _use(provider)
    body = _get(client, auth_headers(office.admin_a), bureau["source"].id,
                explain="true", precedent_id=bureau["won"].id).json()
    [item] = body["items"]
    assert item["ai_explanation"] == {
        "status": "ai", "text": "İki dosya da kira bedelinin tespiti ve TBK 344 ile ilgilidir.", "notice": None,
    }
    [call] = provider.calls
    assert "asla uydurma" in call["system_prompt"]
    assert TEXT["facts_summary"] in call["user_prompt"]
    assert "Bilirkişi raporu ile emsal kira bedeli belirlendi." in call["user_prompt"]
    for other in ("Kira tespiti ret", "Taraflar kira bedeli konusunda sulh oldu.", "B bürosu"):
        assert other not in call["user_prompt"]


class _Slow(MockProvider):
    def complete(self, *args, **kwargs):
        time.sleep(1.5)
        return "geç yanıt"


class _Broken(MockProvider):
    def complete(self, *args, **kwargs):
        raise RuntimeError("provider down")


@pytest.mark.parametrize("provider, notice", [
    (_Slow(), "zamanında alınamadı"),
    (_Broken(), "alınamadı"),
    (MockProvider(default_response="   "), "alınamadı"),
    (MockProvider(default_response="Yargıtay 3. HD E. 2019/1 kararı ve TBK m. 999 uygulanır."), "atıf içerdiği"),
    (None, "kapalı"),
])
def test_explain_falls_back_to_stored_data(client, office, auth_headers, bureau, monkeypatch, provider, notice):
    monkeypatch.setattr(settings, "similarity_explain_timeout_seconds", 0.3)
    _use(provider)
    started = time.monotonic()
    response = _get(client, auth_headers(office.admin_a), bureau["source"].id,
                    explain="true", precedent_id=bureau["won"].id)
    assert response.status_code == 200
    assert time.monotonic() - started < 1.4  # the main response does not wait for a slow provider
    [item] = response.json()["items"]
    ai = item["ai_explanation"]
    assert ai["status"] == "fallback" and notice in ai["notice"]
    # The fallback is built from the extractive explanation only.
    assert "Aynı kategori: Kira" in ai["text"] and "TBK m. 344" in ai["text"]
    assert "999" not in ai["text"]


def test_mock_mode_without_override_uses_the_fallback(client, office, auth_headers, bureau, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mock")
    response = _get(client, auth_headers(office.admin_a), bureau["source"].id, explain="true", limit=2)
    assert response.status_code == 200
    assert {r["ai_explanation"]["status"] for r in response.json()["items"]} == {"fallback"}
