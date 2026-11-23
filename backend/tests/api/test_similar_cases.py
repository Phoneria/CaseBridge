"""Similar cases, stage 1 (specs/018-similar-cases)."""
from datetime import date

import pytest

from app.models.case import Case, CaseOutcome, CaseStatus, CaseType
from app.models.management import WorkspaceAccess
from app.services.similar_cases import CACHE, court_type, is_sibling, tokens, turkish_lower


@pytest.fixture(autouse=True)
def _fresh_cache():
    CACHE.clear()
    yield
    CACHE.clear()


def _case(db, firm, number, name, case_type=CaseType.KIRA, **fields):
    case = Case(law_firm_id=firm.id, case_number=number, case_name=name, client_name="Kurgusal Müvekkil",
                case_type=case_type, **fields)
    db.add(case)
    db.commit()
    return case


LEASE = dict(
    court="İstanbul 14. Sulh Hukuk Mahkemesi", client_role="plaintiff", case_value=120000,
    claim="Kira farkı ve kira bedelinin tespiti; ödenmeyen kira farkı alacağının tahsili.",
    facts_summary="Kiracı yeni dönem kira bedelini eski bedel üzerinden ödedi.",
)


@pytest.fixture()
def bureau(db_session, office):
    db = db_session
    source = _case(db, office.firm_a, "2026/40", "Kira farkı davası", assigned_lawyer_id=office.lawyer_a1.id, **LEASE)
    best = _case(db, office.firm_a, "2025/11", "Kira bedelinin tespiti ve kira farkı",
                 assigned_lawyer_id=office.lawyer_a2.id, status=CaseStatus.KAPALI, outcome=CaseOutcome.WON,
                 opening_date=date(2025, 1, 10), decision_date=date(2025, 7, 9), is_archived=True,
                 court="Ankara 9. Sulh Hukuk Mahkemesi", client_role="plaintiff", case_value=100000,
                 claim="Kira farkı alacağı ve kira bedelinin tespiti.",
                 facts_summary="Kiracı artırılmış kira bedelini ödemedi.")
    weaker = _case(db, office.firm_a, "2026/03", "Tahliye davası", court="İstanbul 3. Sulh Hukuk Mahkemesi",
                   client_role="defendant", claim="Temerrüt nedeniyle tahliye.",
                   facts_summary="İki haklı ihtar sonrası kiralananın tahliyesi.")
    precedent = _case(db, office.firm_a, "Y3HD 2024/5 E.", "Kira farkı emsal kararı", is_precedent=True,
                      status=CaseStatus.KAPALI, outcome=CaseOutcome.WON,
                      claim="Kira farkı ve kira bedelinin tespiti istemi.")
    unrelated = _case(db, office.firm_a, "2026/77", "Kıdem tazminatı", case_type=CaseType.IS_HUKUKU,
                      court="İstanbul 11. İş Mahkemesi", claim="Kıdem ve ihbar tazminatı alacağı.")
    sibling = _case(db, office.firm_a, "2026/40-2", "Kira farkı davası (birleşen)", **LEASE)
    foreign = _case(db, office.firm_b, "2026/40", "Kira farkı davası", **LEASE)
    return dict(source=source, best=best, weaker=weaker, precedent=precedent, unrelated=unrelated,
                sibling=sibling, foreign=foreign)


def test_ranks_closest_cases_first_with_reasons_and_details(client, office, auth_headers, bureau):
    rows = client.get(f"/cases/{bureau['source'].id}/similar", headers=auth_headers(office.lawyer_a1)).json()
    ids = [r["case_id"] for r in rows]
    assert ids[0] == bureau["best"].id
    assert ids.index(bureau["precedent"].id) < ids.index(bureau["weaker"].id)
    assert bureau["unrelated"].id not in ids
    assert [r["score"] for r in rows] == sorted((r["score"] for r in rows), reverse=True)
    best = rows[0]
    assert 0 < best["score"] <= 100
    assert best["status"] == "kapali" and best["outcome"] == "won"
    assert best["duration_days"] == 180 and best["duration_ongoing"] is False
    assert best["assigned_lawyer_name"] == "Mehmet Avukat"
    assert "Aynı kategori: Kira" in best["reasons"]
    assert "Aynı mahkeme türü: Sulh Hukuk" in best["reasons"]
    assert any(reason.startswith("Benzer talep:") and "kira" in reason for reason in best["reasons"])
    precedent = next(r for r in rows if r["case_id"] == bureau["precedent"].id)
    assert precedent["is_precedent"] is True


def test_excludes_the_case_itself_and_its_numbered_sibling(client, office, auth_headers, bureau):
    rows = client.get(f"/cases/{bureau['source'].id}/similar?limit=20", headers=auth_headers(office.admin_a)).json()
    ids = {r["case_id"] for r in rows}
    assert bureau["source"].id not in ids
    assert bureau["sibling"].id not in ids
    assert is_sibling("2026/40", "2026/40-2") and is_sibling("2026/40-1", "2026/40-2")
    assert not is_sibling("2026/40", "2026/400") and not is_sibling("2026/4", "2026/40-1")


def test_never_returns_another_bureaus_cases(client, office, auth_headers, bureau):
    rows = client.get(f"/cases/{bureau['source'].id}/similar?limit=20", headers=auth_headers(office.admin_a)).json()
    assert bureau["foreign"].id not in {r["case_id"] for r in rows}
    # Bureau B sees only its own copy and cannot ask about bureau A's case.
    assert client.get(f"/cases/{bureau['source'].id}/similar", headers=auth_headers(office.lawyer_b)).status_code == 404


def test_free_text_search_is_scoped_to_the_callers_bureau(client, office, auth_headers, bureau):
    a = client.post("/similar-cases/search", json={"text": "kira farkı ve kira bedelinin tespiti", "limit": 20},
                    headers=auth_headers(office.lawyer_a1)).json()
    b = client.post("/similar-cases/search", json={"text": "kira farkı ve kira bedelinin tespiti", "limit": 20},
                    headers=auth_headers(office.lawyer_b)).json()
    firm_a_ids = {c.id for c in bureau.values() if c.law_firm_id == office.firm_a.id}
    assert a and {r["case_id"] for r in a} <= firm_a_ids
    assert [r["case_id"] for r in b] == [bureau["foreign"].id]
    assert a[0]["case_id"] in {bureau["best"].id, bureau["precedent"].id, bureau["source"].id, bureau["sibling"].id}


def test_lawyer_sees_only_cases_they_may_already_read(client, office, auth_headers, bureau, db_session):
    headers = auth_headers(office.lawyer_a1)
    rows = client.get(f"/cases/{bureau['source'].id}/similar?limit=20", headers=headers).json()
    for row in rows:
        path = f"/precedents/{row['case_id']}" if row["is_precedent"] else f"/cases/{row['case_id']}"
        assert client.get(path, headers=headers).status_code == 200, row
    # A restricted workspace account keeps no case access at all.
    db_session.add(WorkspaceAccess(law_firm_id=office.firm_a.id, user_id=office.lawyer_a2.id,
                                   position="client", case_ids=[bureau["source"].id]))
    db_session.commit()
    restricted = auth_headers(office.lawyer_a2)
    assert client.get(f"/cases/{bureau['source'].id}/similar", headers=restricted).status_code == 403
    assert client.post("/similar-cases/search", json={"text": "kira"}, headers=restricted).status_code == 403
    assert client.get(f"/cases/{bureau['source'].id}/similar").status_code == 401


def test_empty_or_meaningless_text(client, office, auth_headers, bureau):
    headers = auth_headers(office.lawyer_a1)
    assert client.post("/similar-cases/search", json={"text": "   "}, headers=headers).status_code == 422
    assert client.post("/similar-cases/search", json={}, headers=headers).status_code == 422
    assert client.post("/similar-cases/search", json={"text": "ve ile bu bir"}, headers=headers).json() == []
    typed = client.post("/similar-cases/search", json={"text": "ve ile", "case_type": "is_hukuku"}, headers=headers).json()
    assert [r["case_id"] for r in typed] == [bureau["unrelated"].id]


def test_case_without_text_or_matches_returns_empty_list(client, office, auth_headers, db_session):
    lonely = _case(db_session, office.firm_a, "2026/90", "Diğer iş", case_type=CaseType.DIGER)
    assert client.get(f"/cases/{lonely.id}/similar", headers=auth_headers(office.admin_a)).json() == []


def test_cache_follows_case_changes(client, office, auth_headers, bureau, db_session):
    headers = auth_headers(office.admin_a)
    url = f"/cases/{bureau['source'].id}/similar?limit=20"
    assert bureau["unrelated"].id not in {r["case_id"] for r in client.get(url, headers=headers).json()}
    bureau["unrelated"].claim = "Kira farkı ve kira bedelinin tespiti"
    db_session.commit()
    assert bureau["unrelated"].id in {r["case_id"] for r in client.get(url, headers=headers).json()}


def test_turkish_normalisation_and_court_types():
    assert turkish_lower("KİRA İHTARI") == "kira ihtarı"
    assert turkish_lower("KIRMIZI IŞIK") == "kırmızı ışık"
    # ASCII-typed "KIRA" still matches "kira": folding maps ı to i after correct lower-casing.
    assert [s for s, _ in tokens("KIRA")] == [s for s, _ in tokens("kira")]
    assert [stem for stem, _ in tokens("KİRA farkı, ve bir İHTAR!")] == ["kira", "farki", "ihtar"]
    assert court_type("İstanbul 3. Asliye Ticaret Mahkemesi") == "Asliye Ticaret"
    assert court_type("ANKARA 2. AĞIR CEZA MAHKEMESİ") == "Ağır Ceza"
    assert court_type("Kocaeli 3. İş Mahkemesi") == "İş"
    assert court_type("İstanbul 12. İcra Hukuk Mahkemesi") == "İcra Hukuk"
    assert court_type(None) is None
