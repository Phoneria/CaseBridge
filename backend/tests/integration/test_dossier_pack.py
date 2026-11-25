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
        nodes = {node["id"]: node for node in tree["nodes"]}
        assert 20 <= len(nodes) <= 100
        current = nodes["recorded"]
        depth, cumulative = 0, 100
        while current["parent_id"]:
            depth += 1
            cumulative *= current["transition_percent"] / 100
            current = nodes[current["parent_id"]]
        assert depth >= 5 and abs(cumulative - nodes["recorded"]["path_percent"]) < 1e-8
        assert len(detail["parties"]) == 2
        from app.models.task import Task
        assert db_session.query(Task).filter_by(case_id=cid).count() == 2
        branch = next(n for n in tree["nodes"] if n["id"] == "recorded")
        assert branch["source_ids"] and branch["probability"] is None
        documents = client.get(f"/cases/{cid}/documents", headers=admin).json()
        assert {d["id"] for d in documents} == {document_key(cid, e.key) for e in records}
        for ref in branch["source_ids"]:
            assert ref[9:] in {d["id"] for d in documents}
        url_pdf = f"/documents/{branch['source_ids'][0][9:]}/download"
        response = client.get(url_pdf, headers=admin)
        assert response.headers["content-type"] == "application/pdf"
        assert "Kurgusal dosya" in PdfReader(BytesIO(response.content)).pages[0].extract_text()
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


def test_every_dossier_path_ends_in_a_grounded_decision():
    from app.legal_lab.dossier_tree import history_nodes
    from app.legal_lab.scenario_tree import TreeSource
    for story in STORIES:
        cid = case_key("fixture-bureau", story)
        sources = [TreeSource(id="document:" + document_key(cid, entry.key),
                              kind="document", label=entry.title, detail="")
                   for entry in entries(story)]
        nodes = history_nodes(cid, story, sources)
        by_id = {n.id: n for n in nodes}
        parents = {n.parent_id for n in nodes}
        assert 20 <= len(nodes) == len(by_id) <= 100, story.code
        leaves = [n for n in nodes if n.id not in parents]
        assert [n.id for n in leaves if n.recorded_step] == ["recorded"]
        for stage in ("evidence", "challenge"):
            children = [n for n in nodes if n.parent_id == stage]
            assert len(children) >= 2, (story.code, stage)
            assert sum(n.recorded_step for n in children) == 1
            for child in children:
                if child.recorded_step:
                    continue
                assert set(child.source_ids) <= {s.id for s in sources}
                decisions = [n for n in leaves if n.parent_id == child.id]
                assert len(decisions) == 1 and decisions[0].source_ids == child.source_ids
                assert decisions[0].reasoning and decisions[0].reasoning != decisions[0].label
        nested_stage = {"C07": "alternative-2-1", "H05": "alternative-1-2", "H08": "alternative-2-2"}.get(story.code)
        if nested_stage:
            assert sum(n.parent_id == nested_stage for n in nodes) == 2
        assert len({n.label for n in leaves}) == len(leaves) >= 5
        for parent in parents - {None}:
            assert sum(n.transition_percent for n in nodes if n.parent_id == parent) == 100
        assert abs(sum(n.path_percent for n in leaves) - 100) < 1e-8
        assert story.end in by_id["recorded"].description
        for leaf in leaves:
            assert leaf.kind == "outcome" and leaf.source_ids
            assert leaf.label and leaf.reasoning and story.claim in leaf.description
            current = leaf
            visited = set()
            while current.parent_id:
                assert current.id not in visited
                visited.add(current.id)
                parent = by_id[current.parent_id]
                assert current.source_ids and current.reasoning
                assert abs(current.path_percent - parent.path_percent * current.transition_percent / 100) < 1e-8
                current = parent
            assert current.id == "root" and len(visited) >= 5
        assert all(n.kind != "outcome" for n in nodes if n.id in parents)
