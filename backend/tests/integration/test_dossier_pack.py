from io import BytesIO

from pypdf import PdfReader

from app.db.dossier_documents import entries
from app.db.dossier_pack import case_key, document_key
from app.db.dossier_stories import STORIES
from app.models.case import Case
from app.models.document import Document


def test_complete_files_resolve_evidence_and_protect_user_additions(client, db_session, office, auth_headers):
    admin = auth_headers(office.admin_a)
    other = auth_headers(office.admin_b)
    url = "/admin/demo-template?package=dossiers"
    first = client.post(url, headers=admin)
    assert first.status_code == 200, first.text
    counts = first.json()["coverage"]
    assert (counts["Ceza dosyaları"], counts["Hukuk dosyaları"]) == (10, 10)
    assert counts["PDF evrak"] == sum(len(entries(s)) for s in STORIES)
    assert client.post(url, headers=admin).json()["added_records"] == 0
    assert client.post(url, headers=auth_headers(office.lawyer_a1)).status_code == 403
    for story in STORIES:
        cid = case_key(office.firm_a.id, story)
        records = entries(story)
        history = records[1:]
        assert [e.day for e in history] == sorted(e.day for e in history)
        assert len({e.key for e in records}) == len(records)
        detail = client.get(f"/cases/{cid}", headers=admin).json()
        assert detail["closing_note"] == story.end and detail["opening_date"] == str(history[0].day)
        tree = client.get(f"/legal-lab/cases/{cid}/scenario-tree", headers=admin).json()
        assert tree["source_mode"] == "dossier_history"
        branch = next(n for n in tree["nodes"] if n["id"] == "recorded")
        assert branch["source_ids"] and branch["probability"] is None
        documents = client.get(f"/cases/{cid}/documents", headers=admin).json()
        assert {d["id"] for d in documents} == {document_key(cid, e.key) for e in records}
        for ref in branch["source_ids"]:
            assert ref[9:] in {d["id"] for d in documents}
        url_pdf = f"/documents/{branch['source_ids'][0][9:]}/download"
        response = client.get(url_pdf, headers=admin)
        assert response.headers["content-type"] == "application/pdf"
        assert "Kurgusal örnek" in PdfReader(BytesIO(response.content)).pages[0].extract_text()
        assert client.get(url_pdf, headers=other).status_code == 404
    first_id = case_key(office.firm_a.id, STORIES[0])
    addition = client.post(f"/cases/{first_id}/documents", files={"file": ("Kullanıcı.txt", b"test")}, headers=admin)
    assert addition.status_code == 201
    preview = client.get("/admin/demo-template/removal-preview", headers=admin).json()
    assert preview["counts"]["Kullanıcı içeriği nedeniyle korunan dava dosyaları"] == 1
    result = client.post("/admin/demo-template/remove", json={"token": preview["token"], "confirm": True}, headers=admin)
    assert result.status_code == 200
    assert db_session.get(Document, addition.json()["id"]) and db_session.get(Case, first_id)
    assert db_session.query(Case).filter_by(law_firm_id=office.firm_a.id).count() == 1
    assert client.post(url, headers=admin).json()["added_cases"] == 19
