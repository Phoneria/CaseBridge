"""Read-only archive of imported, anonymized judicial decisions.

Precedents are stored separately from the firm's caseload in all queries and
statistics. Their original rows and attached documents are preserved.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.models.case import Case, CaseEvent, CasePrecedentLink
from app.models.document import Document
from app.schemas.case import CaseDetailOut, CaseEventOut, CaseOut
from app.schemas.document import DocumentOut
from app.services.case_service import CaseService

router = APIRouter(prefix="/precedents", tags=["precedents"])


def _precedent_or_404(db: Session, precedent_id: str, law_firm_id: str) -> Case:
    precedent = db.query(Case).filter(
        Case.id == precedent_id, Case.law_firm_id == law_firm_id,
        Case.is_precedent.is_(True),
    ).first()
    if precedent is None:
        raise HTTPException(status_code=404, detail="Precedent not found")
    return precedent


class RelatedPrecedentOut(CaseOut):
    linked_to_case: bool = False


@router.get("", response_model=list[RelatedPrecedentOut])
def list_precedents(
    case_id: str | None = None,
    all_categories: bool = False,
    law_firm_id: str = Depends(get_current_law_firm_id), db: Session = Depends(get_db),
):
    query = db.query(Case).filter(Case.law_firm_id == law_firm_id, Case.is_precedent.is_(True))
    linked = set()
    if case_id is not None:
        case = CaseService(db).get_case(case_id, law_firm_id)
        if case is None:
            raise HTTPException(status_code=404, detail="Dava bulunamadı")
        linked = {row[0] for row in db.query(CasePrecedentLink.precedent_id).filter_by(
            law_firm_id=law_firm_id, case_id=case.id).all()}
        if not all_categories:
            query = query.filter(or_(Case.case_type == case.case_type, Case.id.in_(linked)))
    rows = query.order_by(Case.opening_date.desc(), Case.case_number).all()
    return [RelatedPrecedentOut.model_validate(row).model_copy(update={"linked_to_case": row.id in linked})
            for row in sorted(rows, key=lambda row: row.id not in linked)]


@router.get("/{precedent_id}", response_model=CaseDetailOut)
def get_precedent(
    precedent_id: str, law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    precedent = _precedent_or_404(db, precedent_id, law_firm_id)
    events = db.query(CaseEvent).filter(
        CaseEvent.case_id == precedent.id, CaseEvent.law_firm_id == law_firm_id,
    ).order_by(CaseEvent.event_date).all()
    return CaseDetailOut.model_validate(precedent).model_copy(
        update={"timeline": [CaseEventOut.model_validate(event) for event in events]}
    )


@router.get("/{precedent_id}/documents", response_model=list[DocumentOut])
def list_precedent_documents(
    precedent_id: str, law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _precedent_or_404(db, precedent_id, law_firm_id)
    return db.query(Document).filter(
        Document.case_id == precedent_id, Document.law_firm_id == law_firm_id,
    ).order_by(Document.uploaded_at.desc()).all()
