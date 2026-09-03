from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentWithCaseOut
from app.services.case_service import CaseService
from app.services.document_service import DocumentService

cases_router = APIRouter(prefix="/cases", tags=["documents"])
documents_router = APIRouter(prefix="/documents", tags=["documents"])


def _get_owned_case_or_404(db: Session, case_id: str, law_firm_id: str):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


@cases_router.post("/{case_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    case_id: str,
    file: UploadFile = File(...),
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    raw_bytes = await file.read()
    if len(raw_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_size_bytes} byte upload limit.",
        )
    return DocumentService(db).upload(
        case_id=case_id,
        law_firm_id=law_firm_id,
        filename=file.filename,
        raw_bytes=raw_bytes,
        uploaded_by=current_user.id,
    )


@cases_router.get("/{case_id}/documents", response_model=list[DocumentOut])
def list_documents(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    return DocumentService(db).list_for_case(case_id, law_firm_id)


@documents_router.get("", response_model=list[DocumentWithCaseOut])
def list_all_documents(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    rows = DocumentService(db).list_for_firm_with_case(law_firm_id)
    return [
        DocumentWithCaseOut(
            **DocumentOut.model_validate(document, from_attributes=True).model_dump(),
            case_name=case_name,
            case_number=case_number,
        )
        for document, case_name, case_number in rows
    ]


@documents_router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = DocumentService(db)
    document = service.get(document_id, law_firm_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    service.delete(document)
