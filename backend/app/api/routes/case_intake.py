"""POST /case-intake/extract - propose new-case form values from a document."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.ai.providers.base import LLMProvider
from app.api.deps import get_case_intake_provider_dep, get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.case_intake import CaseIntakeExtractOut
from app.services.case_intake_service import CaseIntakeError, CaseIntakeService
from app.services.document_service import resolve_document_type
from app.services.text_extraction import extract_text

# A plain `def` route: the model call blocks, so it must run in the thread pool.
router = APIRouter(prefix="/case-intake", tags=["case-intake"])

MAX_TEXT_CHARS = 200_000
NOT_READABLE = "Bu belgeden metin çıkarılamadı (taranmış olabilir). Metni yapıştırabilirsiniz."


@router.post("/extract", response_model=CaseIntakeExtractOut)
def extract_case_draft(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
    _: User = Depends(get_current_user),
    provider: LLMProvider = Depends(get_case_intake_provider_dep),
):
    if file is not None and text is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Dosya ve metinden yalnızca biri gönderilebilir.")
    if file is None and text is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bir dosya yükleyin veya metin yapıştırın.")

    if file is not None:
        file_type = resolve_document_type(file.filename or "")
        raw_bytes = file.file.read()
        if len(raw_bytes) > settings.max_upload_size_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"File exceeds the {settings.max_upload_size_bytes} byte upload limit.",
            )
        document_text = extract_text(file_type, raw_bytes)
        if document_text is None or not document_text.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, NOT_READABLE)
    else:
        if not text.strip() or len(text) > MAX_TEXT_CHARS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Metin 1 ile 200.000 karakter arasında olmalıdır."
            )
        document_text = text

    try:
        result = CaseIntakeService(provider).extract(document_text)
    except CaseIntakeError as exc:
        raise HTTPException(exc.status_code, exc.detail)
    return CaseIntakeExtractOut(draft=result.draft, truncated=result.truncated, source_chars=result.source_chars)
