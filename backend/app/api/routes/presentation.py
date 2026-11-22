"""Read-only sample views. Never interpolate bureau-authored documents or free text."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.demo_presentation_seed import identity
from app.db.demo_team import demo_case_ids
from app.db.dossier_documents import entries
from app.db.dossier_pack import case_key, document_key, package_cases
from app.db.dossier_stories import STORIES
from app.db.session import get_db
from app.legal_lab.dossier_tree import history_nodes
from app.legal_lab.scenario_tree import TreeSource
from app.models.document import Document
from app.models.management import ManagementRecord
from app.models.user import User
from app.services.dossier_pdf import render_dossier
from app.services.presentation_mask import catalogue_mask

router = APIRouter(prefix="/presentation", tags=["presentation"])


def visible_catalogue(db, user):
    if user.is_platform_admin:
        raise HTTPException(403, "Büro oturumu gerekli.")
    present = {c.id for c in package_cases(db, user.law_firm_id)}
    allowed = demo_case_ids(db, user)
    if allowed is not None:
        present.intersection_update(allowed)
    return {cid: s for s in STORIES if (cid := case_key(user.law_firm_id, s)) in present}


def selected(db, user, cid):
    story = visible_catalogue(db, user).get(cid)
    if not story:
        raise HTTPException(404, "Sunum dosyası bulunamadı.")
    ids = {row.id for row in db.query(Document.id).filter_by(case_id=cid, law_firm_id=user.law_firm_id)
           .filter(Document.storage_path == "demo://dossier/" + Document.id)}
    return story, {did: e for e in entries(story) if (did := document_key(cid, e.key)) in ids}


def summary(cid, story):
    mask = catalogue_mask()
    return dict(id=cid, title=mask(story.title), client=mask(story.client), opponent=mask(story.opponent))


@router.get("")
def catalogue(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cases = [summary(cid, s) for cid, s in visible_catalogue(db, user).items()]
    contacts = []
    if user.role.value == "admin":
        # Only expose catalogue aliases from the six generated contact rows.
        keys = [identity(user.law_firm_id, f"record:client:{i}") for i in range(6)]
        rows = db.query(ManagementRecord.id, ManagementRecord.data, ManagementRecord.title).filter(
            ManagementRecord.id.in_(keys), ManagementRecord.law_firm_id == user.law_firm_id,
            ManagementRecord.kind == "client", ManagementRecord.deleted_at.is_(None)).all()
        mask = catalogue_mask()
        for row in sorted(rows, key=lambda r: keys.index(r.id)):
            i = keys.index(row.id)
            name = (row.data or {}).get("company") or row.title.removeprefix("ÖRNEK · ").removeprefix("Örnek · ")
            label = mask(name)
            if not re_full_alias(label):
                label = f"Müvekkil {i+1}"
            phone, email = row.data.get("phone"), row.data.get("email")
            contacts.append(dict(name=label,
                                 phone=mask(phone) if phone == f"0538 000 00 {i+10:02}" else None,
                                 email=mask(email) if email == f"iletisim{i+1}@example.com" else None))
    return dict(cases=cases, contacts=contacts)


def re_full_alias(label):
    return label.rpartition(" ")[0] in {"Kişi", "Şirket", "Kurum"} and label.rpartition(" ")[2].isdigit()


@router.get("/{cid}")
def dossier(cid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    story, records = selected(db, user, cid)
    mask = catalogue_mask()
    sources = [TreeSource(id="document:" + did, kind="document", label=e.title, detail="") for did, e in records.items()]
    nodes = []
    for node in history_nodes(cid, story, sources):
        item = node.model_dump()
        for field in ("label", "description", "reasoning"):
            item[field] = mask(item[field])
        nodes.append(item)
    return {**summary(cid, story), "facts": mask(story.facts), "closing": mask(story.end), "nodes": nodes,
            "documents": [dict(id=did, title=mask(e.title), day=e.day, text=mask(e.text)) for did, e in records.items()]}


@router.get("/{cid}/documents/{did}")
def pdf(cid: str, did: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, records = selected(db, user, cid)
    if did not in records:
        raise HTTPException(404, "Sunum belgesi bulunamadı.")
    return Response(render_dossier(catalogue_mask()(records[did].text)), media_type="application/pdf",
                    headers={"Cache-Control": "private, no-store", "Content-Disposition": 'attachment; filename="sunum-belgesi.pdf"'})
