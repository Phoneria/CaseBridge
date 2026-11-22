"""Emsal karar arama (legal lab): örnek mod, kelime indeksi, filtreler, yetki ve açıklama (mock)."""
import json
import sqlite3

import pytest

from app.core.config import settings
from app.legal_lab import precedents
from app.legal_lab.precedents import tokens


def _headers(client, user, password):
    token = client.post("/auth/login", json={"email": user.email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


DOCS = [
    ("yargitay:1", "yargitay", "yargitay", "3. Hukuk Dairesi", "2020/1", "2021/5", "2021-03-01", 2021, "bozma",
     "Davacı kiracı, davalı kiraya veren aleyhine kira sözleşmesinin feshi ve depozito iadesi için dava açmıştır. Kiracı ihbar önelini beklemeden taşınmazı tahliye etmiştir.",
     ["TBK m.347"]),
    ("emsal:2", "emsal", "ilk_derece", "İstanbul 3. Asliye Hukuk Mahkemesi", "2019/10", "2020/99", "2020-05-05", 2020, "kabul",
     "Davacı işçi, işverenden fazla mesai ücreti ve kıdem tazminatı alacağının tahsilini talep etmiştir. İşveren ibraname sunmuştur.",
     ["4857 s. K. m.41"]),
    ("emsal:3", "emsal", "bam", "Ankara Bölge Adliye Mahkemesi 23. Hukuk Dairesi", "2018/2015", "2022/566", "2022-04-06", 2022, "istinaf_ret",
     "Davacı vekili tarafından ticari alacağın tahsili istemiyle açılan davada ilk derece mahkemesi davanın kısmen kabulüne karar vermiştir.",
     ["HMK m.341"]),
]


def _build_index(path, n_pad=0):
    path.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path / "precedents.sqlite")
    db.executescript(
        """
        CREATE TABLE docs(id INTEGER PRIMARY KEY, doc_id TEXT UNIQUE, source TEXT, kind TEXT, court TEXT, esas_no TEXT,
                          karar_no TEXT, tarih TEXT, year INTEGER, outcome TEXT, laws TEXT, narr TEXT, tail TEXT);
        CREATE VIRTUAL TABLE fts USING fts5(body, content='', tokenize='unicode61 remove_diacritics 0');
        """
    )
    for i, (did, src, kind, court, e, k, t, y, out, narr, laws) in enumerate(DOCS, 1):
        db.execute("insert into docs values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (i, did, src, kind, court, e, k, t, y, out, json.dumps(laws, ensure_ascii=False), narr, "… hüküm metni"))
        db.execute("insert into fts(rowid, body) values (?,?)", (i, " ".join(tokens(narr))))
    for j in range(n_pad):  # sık terimleri %25 eşiğinin altında tutan dolgu belgeler
        i = len(DOCS) + 1 + j
        db.execute("insert into docs values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (i, f"pad:{j}", "emsal", "ilk_derece", "Pad", "1", "1", "2020-01-01", 2020, "ret", "[]", "alakasız metin parçası", ""))
        db.execute("insert into fts(rowid, body) values (?,?)", (i, "alakasız metin parçası"))
    db.executescript("CREATE VIRTUAL TABLE fv USING fts5vocab(fts, 'row');")
    db.commit()
    db.close()
    (path / "meta.json").write_text(json.dumps({"built": "test", "sources": ["yargitay", "emsal"]}), encoding="utf-8")


@pytest.fixture()
def lexical_index(tmp_path, monkeypatch):
    _build_index(tmp_path / "idx", n_pad=20)
    monkeypatch.setattr(settings, "precedent_index_dir", str(tmp_path / "idx"))
    precedents.reset_index_for_tests()
    yield
    precedents.reset_index_for_tests()


def test_requires_login(client):
    assert client.get("/legal-lab/precedents/status").status_code == 401
    assert client.post("/legal-lab/precedents/search", json={"query": "x"}).status_code == 401


def test_sample_mode_without_index(client, two_firms_two_users, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "precedent_index_dir", str(tmp_path / "yok"))
    precedents.reset_index_for_tests()
    h = _headers(client, two_firms_two_users["user_a"], two_firms_two_users["password"])
    st = client.get("/legal-lab/precedents/status", headers=h).json()
    assert st["mode"] == "sample" and st["note"]
    r = client.post("/legal-lab/precedents/search", json={"query": "kira sözleşmesi tahliye depozito"}, headers=h).json()
    assert r["mode"] == "sample" and r["note"]
    assert len(r["results"]) >= 1 and r["results"][0]["doc_id"]
    first = r["results"][0]["doc_id"]
    d = client.get(f"/legal-lab/precedents/{first}", headers=h).json()
    assert d["narr"] and "tail" in d
    precedents.reset_index_for_tests()


def test_lexical_search_ranks_relevant_first(client, two_firms_two_users, lexical_index):
    h = _headers(client, two_firms_two_users["user_a"], two_firms_two_users["password"])
    st = client.get("/legal-lab/precedents/status", headers=h).json()
    assert st["mode"] == "lexical" and st["indexed"] == len(DOCS) + 20
    r = client.post("/legal-lab/precedents/search", json={"query": "kiracı depozito iadesi tahliye kira sözleşmesi"}, headers=h).json()
    assert r["mode"] == "lexical" and r["note"] is None
    assert r["results"][0]["doc_id"] == "yargitay:1"
    assert r["results"][0]["outcome_label"] == "Bozma" and r["results"][0]["laws"] == ["TBK m.347"]
    assert r["stats"]["by_kind"]["yargitay"]["total"] == 1 and "tahmin değildir" in r["stats"]["note"]


def test_filters_narrow_results(client, two_firms_two_users, lexical_index):
    h = _headers(client, two_firms_two_users["user_a"], two_firms_two_users["password"])
    q = "davacı alacak tahsil talep dava açmıştır kiracı işçi"
    allr = client.post("/legal-lab/precedents/search", json={"query": q}, headers=h).json()["results"]
    assert len(allr) >= 2
    only_bam = client.post("/legal-lab/precedents/search", json={"query": q, "filters": {"kinds": ["bam"]}}, headers=h).json()["results"]
    assert only_bam and all(x["kind"] == "bam" for x in only_bam)
    late = client.post("/legal-lab/precedents/search", json={"query": q, "filters": {"year_min": 2022}}, headers=h).json()["results"]
    assert late and all(x["year"] >= 2022 for x in late)
    none = client.post("/legal-lab/precedents/search", json={"query": q, "filters": {"outcomes": ["onama"]}}, headers=h).json()["results"]
    assert none == []


def test_detail_unknown_is_404_and_explain_mock(client, two_firms_two_users, lexical_index):
    h = _headers(client, two_firms_two_users["user_a"], two_firms_two_users["password"])
    assert client.get("/legal-lab/precedents/yok:1", headers=h).status_code == 404
    r = client.post("/legal-lab/precedents-explain", json={"query": "kiracı depozito tahliye", "doc_ids": ["yargitay:1"]}, headers=h).json()
    assert r["mode"] == "mock" and r["explanations"][0]["doc_id"] == "yargitay:1"
    assert "Bozma" in r["explanations"][0]["why"]


def test_case_is_firm_scoped_for_search(client, db_session, two_firms_two_users, lexical_index):
    from app.models.case import Case, CaseType

    f = two_firms_two_users
    case = Case(law_firm_id=f["firm_b"].id, case_number="2026/77", case_name="B Kira", client_name="X",
                case_type=CaseType.SOZLESME, assigned_lawyer_id=f["user_b"].id)
    db_session.add(case)
    db_session.commit()
    ha = _headers(client, f["user_a"], f["password"])
    assert client.post("/legal-lab/precedents/search", json={"case_id": case.id}, headers=ha).status_code == 404
    hb = _headers(client, f["user_b"], f["password"])
    assert client.post("/legal-lab/precedents/search", json={"case_id": case.id}, headers=hb).status_code == 200
