from io import BytesIO

from pypdf import PdfReader

from app.db.dossier_documents import entries
from app.db.dossier_pack import case_key
from app.db.dossier_stories import STORIES
from app.services.presentation_mask import Aliases, catalogue_mask, GENERIC_ROLE


def test_aliases_are_consistent_across_identifiers_and_all_sample_text():
    a = Aliases().add("Kişi", "İpek Ilgaz").add("Şirket", "Koru Depo")
    line = "İpek Ilgaz · Koru Depo · 12345678901 · iletisim@example.test · 0538 000 00 11 · TR12 3456 7890 1234 5678 9012 34\nAdres: A Mahallesi, 3. Sokak No 8"
    a.collect(line)
    masked = a.renderer()(line)
    for tag in ("Kişi", "Şirket", "T.C.", "E-posta", "Telefon", "IBAN", "Adres"):
        assert f"{tag} 1" in masked
    assert "Mahallesi" not in masked and "3456" not in masked
    mask = catalogue_mask()
    for story in STORIES:
        for entry in entries(story):
            for name in (story.client, story.opponent):
                if name != GENERIC_ROLE:
                    assert name not in mask(entry.text)


def test_masked_portfolio_tree_preview_and_pdf_are_scoped(client, db_session, office, auth_headers):
    a, b = auth_headers(office.admin_a), auth_headers(office.admin_b)
    assert client.get("/presentation", headers=a).json()["cases"] == []
    assert client.post("/admin/demo-template?package=dossiers", headers=a).status_code == 200
    index = client.get("/presentation", headers=a).json()
    assert len(index["cases"]) == 20
    for story, row in zip(STORIES, index["cases"], strict=True):
        view = client.get("/presentation/" + row["id"], headers=a).json()
        assert len(view["documents"]) == len(entries(story))
        for name in (story.client, story.opponent):
            if name != GENERIC_ROLE:
                assert name not in str(view)
        sources = {"document:" + doc["id"] for doc in view["documents"]}
        assert all(set(node["source_ids"]) <= sources for node in view["nodes"])
    assert client.get("/presentation", headers=b).json()["cases"] == []
    story = STORIES[0]
    cid = case_key(office.firm_a.id, story)
    detail = client.get(f"/presentation/{cid}", headers=a).json()
    assert story.client not in str(detail) and detail["client"] == index["cases"][0]["client"]
    assert detail["client"].startswith("Kişi ")
    assert len(detail["nodes"]) >= 20
    root = next(n for n in detail["nodes"] if n["id"] == "root")
    did = root["source_ids"][0].removeprefix("document:")
    doc = next(d for d in detail["documents"] if d["id"] == did)
    assert detail["client"] in doc["text"]
    path = f"/presentation/{cid}/documents/{did}"
    masked = client.get(path, headers=a)
    assert masked.headers["content-type"] == "application/pdf"
    text = "".join(p.extract_text() for p in PdfReader(BytesIO(masked.content)).pages)
    assert detail["client"] in text and story.client not in text and story.opponent not in text
    assert client.get(path, headers=b).status_code == 404
    assert client.get(f"/presentation/{cid}/documents/unknown", headers=a).status_code == 404
    assert client.get(f"/cases/{cid}", headers=a).json()["client_name"] == story.client
    stored = client.get(f"/cases/{cid}/documents", headers=a).json()
    assert story.client in next(d for d in stored if d["id"] == did)["extracted_text"]
