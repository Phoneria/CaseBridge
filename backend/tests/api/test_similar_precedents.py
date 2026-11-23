"""Similar precedents for the "Benzer Davalar" sidebar (specs/019-similar-precedents)."""
from datetime import date

import pytest

from app.models.case import Case, CaseOutcome, CasePrecedentLink, CaseStatus, CaseType
from app.models.document import Document, DocumentType
from app.models.management import WorkspaceAccess
from app.services.similarity_service import (
    CACHE, court_match, normalize, split_sentences, statute_refs, stem, word_spans,
)
from app.services.similar_cases import turkish_lower


@pytest.fixture(autouse=True)
def _fresh_cache():
    CACHE.invalidate()
    yield
    CACHE.invalidate()


def _case(db, firm, number, name, case_type=CaseType.KIRA, **fields):
    case = Case(law_firm_id=firm.id, case_number=number, case_name=name, client_name="Kurgusal Müvekkil",
                case_type=case_type, **fields)
    db.add(case)
    db.commit()
    return case


def _precedent(db, firm, number, name, case_type=CaseType.KIRA, **fields):
    fields.setdefault("status", CaseStatus.KAPALI)
    fields.setdefault("outcome", CaseOutcome.WON)
    return _case(db, firm, number, name, case_type=case_type, is_precedent=True, **fields)


def _document(db, case, filename, text):
    doc = Document(case_id=case.id, law_firm_id=case.law_firm_id, filename=filename, file_type=DocumentType.TXT,
                   storage_path=f"synthetic/{filename}", extracted_text=text)
    db.add(doc)
    db.commit()
    return doc


SOURCE = dict(
    court="İstanbul 14. Sulh Hukuk Mahkemesi", case_value=120000,
    claim="Kira bedelinin tespiti ve ödenmeyen kira farkının tahsili; TBK 344 uyarınca uyarlama.",
    facts_summary="Kiracı yeni dönem kira bedelini eski bedel üzerinden ödedi. Kiraya veren ihtarname gönderdi.",
)


@pytest.fixture()
def archive(db_session, office):
    db = db_session
    a, b = office.firm_a, office.firm_b
    source = _case(db, a, "2026/40", "Kira tespit davası", assigned_lawyer_id=office.lawyer_a1.id, **SOURCE)
    best = _precedent(
        db, a, "Y3HD 2024/5 E.", "Kira bedelinin tespiti emsal kararı",
        court="Yargıtay 3. Hukuk Dairesi", decision_date=date(2024, 6, 1), case_value=100000,
        claim="Kira bedelinin tespiti istemi.",
        facts_summary="Kiracı yeni dönem kira bedelini ödemedi; TBK m. 344 ile hakkaniyete uygun kira bedeli belirlendi.",
    )
    same_court = _precedent(
        db, a, "2023/18", "Sulh hukuk tahliye kararı", court="Ankara 2. Sulh Hukuk Mahkemesi",
        claim="Temerrüt nedeniyle tahliye.", facts_summary="İki haklı ihtar sonrası kiralananın tahliyesi.",
    )
    via_document = _precedent(
        db, a, "2022/7", "Belgeli kira kararı", case_type=CaseType.DIGER,
        claim="Uyuşmazlık.",
    )
    _document(db, via_document, "karar.txt",
              "Kiracı yeni dönem kira bedelini eski bedel üzerinden ödemiştir. Kira farkı ve kira bedelinin "
              "tespiti talebi TBK 344 kapsamında kabul edilmiştir.")
    unrelated = _precedent(
        db, a, "Y9HD 2023/1 E.", "Kıdem tazminatı kararı", case_type=CaseType.IS_HUKUKU,
        court="Yargıtay 9. Hukuk Dairesi", claim="Kıdem ve ihbar tazminatı alacağı.",
    )
    ordinary = _case(db, a, "2025/11", "Kira bedelinin tespiti (dava)", **SOURCE)
    foreign = _precedent(db, b, "Y3HD 2024/5 E.", "Kira bedelinin tespiti emsal kararı",
                         court="Yargıtay 3. Hukuk Dairesi", claim=SOURCE["claim"],
                         facts_summary=SOURCE["facts_summary"])
    _document(db, foreign, "yabanci.txt", SOURCE["facts_summary"])
    return dict(source=source, best=best, same_court=same_court, via_document=via_document,
                unrelated=unrelated, ordinary=ordinary, foreign=foreign)


def _get(client, headers, case_id, limit=20):
    return client.get(f"/cases/{case_id}/similar-precedents?limit={limit}", headers=headers)


def test_ranks_precedents_with_hybrid_score_and_extractive_explanation(client, office, auth_headers, archive):
    rows = _get(client, auth_headers(office.lawyer_a1), archive["source"].id).json()
    ids = [r["precedent_id"] for r in rows]
    assert ids[0] == archive["best"].id
    assert archive["unrelated"].id not in ids
    assert [r["score"] for r in rows] == sorted((r["score"] for r in rows), reverse=True)
    best = rows[0]
    assert 0 < best["score"] <= 100 and 0 < best["text_score"] <= 100
    assert best["case_number"] == "Y3HD 2024/5 E." and best["outcome"] == "won"
    assert best["decision_date"] == "2024-06-01" and best["linked_to_case"] is False
    why = best["explanation"]
    assert why["shared_statutes"] == ["TBK m. 344"]
    assert "Aynı kategori: Kira" in why["matching_fields"]
    assert "Yakın dava değeri" in why["matching_fields"]
    assert 0 < len(why["shared_terms"]) <= 8 and any("kira" in t.lower() for t in why["shared_terms"])
    assert 1 <= len(why["passages"]) <= 3
    # Same-court precedent earns the court signal.
    same_court = next(r for r in rows if r["precedent_id"] == archive["same_court"].id)
    assert "Aynı mahkeme türü: Sulh Hukuk" in same_court["explanation"]["matching_fields"]


def test_only_precedents_are_returned_never_ordinary_cases(client, office, auth_headers, archive):
    rows = _get(client, auth_headers(office.admin_a), archive["source"].id).json()
    ids = {r["precedent_id"] for r in rows}
    assert archive["ordinary"].id not in ids and archive["source"].id not in ids


def test_document_text_counts_and_is_labelled(client, office, auth_headers, archive):
    rows = _get(client, auth_headers(office.admin_a), archive["source"].id).json()
    row = next(r for r in rows if r["precedent_id"] == archive["via_document"].id)
    assert row["explanation"]["shared_statutes"] == ["TBK m. 344"]
    assert any(p["precedent_label"] == "Belge: karar.txt" for p in row["explanation"]["passages"])


def test_passages_and_terms_come_only_from_stored_text(client, office, auth_headers, archive, db_session):
    """Anti-hallucination: every explanation string is copied from the stored case or precedent data."""
    rows = _get(client, auth_headers(office.admin_a), archive["source"].id).json()
    assert rows
    source = archive["source"]
    source_text = " ".join(filter(None, [source.case_name, source.claim, source.facts_summary]))
    for row in rows:
        precedent = db_session.get(Case, row["precedent_id"])
        docs = db_session.query(Document.extracted_text).filter_by(case_id=precedent.id).all()
        precedent_text = " ".join(filter(None, [precedent.case_name, precedent.claim, precedent.facts_summary,
                                                *[d[0] for d in docs]]))
        why = row["explanation"]
        for term in why["shared_terms"]:
            assert term in turkish_lower(source_text)  # shown as written in this case
            assert normalize(term)[0] in normalize(precedent_text)  # and the precedent shares its stem
        for key in why["shared_statutes"]:
            assert key in statute_refs(source_text) and key in statute_refs(precedent_text)
        for p in why["passages"]:
            assert p["case_text"] in source_text
            assert p["precedent_text"] in precedent_text
            assert p["case_highlights"] and p["precedent_highlights"]
            case_words = {stem_of(p["case_text"][h["start"]:h["end"]]) for h in p["case_highlights"]}
            precedent_words = {stem_of(p["precedent_text"][h["start"]:h["end"]]) for h in p["precedent_highlights"]}
            assert case_words == precedent_words  # each highlight marks a term the other side shares


def stem_of(word: str) -> str:
    return normalize(word)[0]


def test_never_reads_another_bureaus_precedents(client, office, auth_headers, archive):
    rows = _get(client, auth_headers(office.admin_a), archive["source"].id).json()
    assert archive["foreign"].id not in {r["precedent_id"] for r in rows}
    # Bureau B cannot use bureau A's case as a source.
    assert _get(client, auth_headers(office.lawyer_b), archive["source"].id).status_code == 404
    # Bureau B's own case only ever sees bureau B's precedent.
    own = _case(_session(archive), office.firm_b, "2026/1", "Kira tespit davası", **SOURCE)
    rows_b = _get(client, auth_headers(office.lawyer_b), own.id).json()
    assert [r["precedent_id"] for r in rows_b] == [archive["foreign"].id]


def _session(archive):
    from sqlalchemy.orm import object_session
    return object_session(archive["source"])


def test_access_rules(client, office, auth_headers, archive, db_session):
    assert _get(client, {}, archive["source"].id).status_code == 401
    # A precedent is not a source case.
    assert _get(client, auth_headers(office.admin_a), archive["best"].id).status_code == 404
    assert _get(client, auth_headers(office.admin_a), "missing").status_code == 404
    assert client.get(f"/cases/{archive['source'].id}/similar-precedents?limit=21",
                      headers=auth_headers(office.admin_a)).status_code == 422
    db_session.add(WorkspaceAccess(law_firm_id=office.firm_a.id, user_id=office.lawyer_a2.id,
                                   position="client", case_ids=[archive["source"].id]))
    db_session.commit()
    assert _get(client, auth_headers(office.lawyer_a2), archive["source"].id).status_code == 403
    # Every result is a precedent the caller may already open.
    headers = auth_headers(office.lawyer_a1)
    for row in _get(client, headers, archive["source"].id).json():
        assert client.get(f"/precedents/{row['precedent_id']}", headers=headers).status_code == 200


def test_linked_flag_follows_case_links(client, office, auth_headers, archive):
    headers = auth_headers(office.admin_a)
    case_id, precedent_id = archive["source"].id, archive["best"].id
    assert client.put(f"/cases/{case_id}/precedents/{precedent_id}", headers=headers).status_code == 204
    row = next(r for r in _get(client, headers, case_id).json() if r["precedent_id"] == precedent_id)
    assert row["linked_to_case"] is True


def test_cache_follows_precedent_and_document_changes(client, office, auth_headers, archive, db_session):
    headers = auth_headers(office.admin_a)
    case_id = archive["source"].id
    assert archive["unrelated"].id not in {r["precedent_id"] for r in _get(client, headers, case_id).json()}
    archive["unrelated"].claim = "Kira bedelinin tespiti ve kira farkı"
    db_session.commit()
    assert archive["unrelated"].id in {r["precedent_id"] for r in _get(client, headers, case_id).json()}
    fresh = _precedent(db_session, office.firm_a, "2021/2", "Miras emsali", case_type=CaseType.DIGER, claim="Uyuşmazlık.")
    assert fresh.id not in {r["precedent_id"] for r in _get(client, headers, case_id).json()}
    _document(db_session, fresh, "yeni.txt", "Kira bedelinin tespiti ve ödenmeyen kira farkı; TBK 344.")
    assert fresh.id in {r["precedent_id"] for r in _get(client, headers, case_id).json()}


def test_case_without_matches_returns_empty_list(client, office, auth_headers, db_session):
    lonely = _case(db_session, office.firm_a, "2026/90", "Diğer iş", case_type=CaseType.DIGER)
    assert _get(client, auth_headers(office.admin_a), lonely.id).json() == []


# --- Unit level -----------------------------------------------------------------------

def test_turkish_normalisation_and_suffix_trimming():
    assert normalize("KİRA İHTARI") == normalize("kira ihtarı")
    assert normalize("KIRA") == normalize("kira")
    assert normalize("ve bir ile, bu!") == []
    # Inflected forms share a stem.
    assert stem("kiracinin") == stem("kiraci") == "kirac"
    assert {normalize(w)[0] for w in ("bedel", "bedeli", "bedelinin", "bedellerinin")} == {"bedel"}
    assert {normalize(w)[0] for w in ("tahliye", "tahliyesi", "tahliyenin")} == {"tahli"}
    # Offsets index the original text even with dotted capitals.
    text = "İİK m. 67 ve KİRA farkı"
    assert [text[s:e] for s, e, _, _ in word_spans(text)] == ["İİK", "KİRA", "farkı"]


def test_statute_and_decision_reference_extraction():
    refs = statute_refs(
        "TBK 49, İİK m. 67, HMK md. 107; TBK'nın 344. maddesi; 4857 sayılı İş Kanunu'nun 18. maddesi; "
        "Yargıtay 3. Hukuk Dairesi 2024/5 E., 2024/90 K.; Yargıtay 9. HD E. 2023/12 K. 2023/400; "
        "Yargıtay HGK 2019/1 E."
    )
    assert set(refs) == {
        "TBK m. 49", "İİK m. 67", "HMK m. 107", "TBK m. 344", "4857 s. Kanun m. 18",
        "Yargıtay 3. HD E. 2024/5 K. 2024/90", "Yargıtay 9. HD E. 2023/12 K. 2023/400", "Yargıtay HGK E. 2019/1",
    }
    assert refs["İİK m. 67"] == "İİK m. 67"
    assert statute_refs("Ayın 5'inde ödeme yapıldı, ik 3 kez") == {}
    assert statute_refs(None) == {}


def test_sentence_split_keeps_numbers_articles_and_docket_markers():
    text = "Aylık kira 15.000 TL. TBK m. 344 uygulanır; Yargıtay 3. HD 2024/5 E., 2024/90 K. sayılı karar.\nSon satır"
    assert split_sentences(text) == [
        "Aylık kira 15.000 TL.", "TBK m. 344 uygulanır;",
        "Yargıtay 3. HD 2024/5 E., 2024/90 K. sayılı karar.", "Son satır",
    ]


def test_court_match():
    assert court_match("İstanbul 1. Sulh Hukuk Mahkemesi", "İSTANBUL 1. SULH HUKUK MAHKEMESİ")[0] == 1.0
    assert court_match("İstanbul 1. Sulh Hukuk Mahkemesi", "Ankara 2. Sulh Hukuk Mahkemesi") == (
        1.0, "Aynı mahkeme türü: Sulh Hukuk")
    assert court_match("İstanbul 1. Sulh Hukuk Mahkemesi", "Ankara 2. Asliye Hukuk Mahkemesi")[0] == 0.5
    assert court_match("İstanbul 1. Sulh Hukuk Mahkemesi", "Ankara 2. Ağır Ceza Mahkemesi") == (0.0, None)
    assert court_match(None, "Ankara 2. Ağır Ceza Mahkemesi") == (0.0, None)
