"""Stateless masking of user-supplied text; no provider or document storage."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Literal
from starlette.concurrency import run_in_threadpool
from app.privacy.files import MAX_BYTES, ExtractionError, extract_document_isolated

from app.api.deps import get_current_user
from app.models.user import User
from app.privacy.anonymizer import anonymize
from app.privacy import ner

router = APIRouter(prefix="/privacy", tags=["privacy"])


class MaskedText(BaseModel):
    text: str
    counts: dict[str, int]
    report: dict[str, dict]
    ner_available: bool
    review_required: bool = True


@router.post("/anonymize", response_model=MaskedText)
async def mask_text(request: Request, response: Response, user: User = Depends(get_current_user)):
    if user.law_firm.is_platform or user.is_platform_admin:
        raise HTTPException(403, "Bu araç büro çalışma alanı içindir.")
    # Parse manually: default validation responses can reflect the submitted text.
    try:
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 200000:
                raise HTTPException(422, "Metin boyutu sınırı aşıldı.")
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, "Geçerli bir metin gönderin.") from None
    if (not isinstance(payload, dict) or set(payload) != {"text"}
            or not isinstance(payload["text"], str)
            or not payload["text"].strip() or len(payload["text"]) > 30000):
        raise HTTPException(422, "1–30.000 karakter arasında bir metin gönderin.")
    # Only reuse an already loaded local pipeline; never download a model here.
    has_ner = ner._pipe is not None
    from starlette.concurrency import run_in_threadpool
    result = await run_in_threadpool(anonymize, payload["text"], extra_detectors=[ner.detect] if has_ner else [])
    response.headers["Cache-Control"] = "no-store"
    return MaskedText(text=result.text, counts=result.counts, report=result.report, ner_available=has_ner)


class ExtractedText(BaseModel):
    text: str
    format: Literal["pdf", "docx", "text"]
    warnings: list[str]


@router.post("/extract-text", response_model=ExtractedText)
async def extract_file(request: Request, response: Response, user: User = Depends(get_current_user)):
    if user.law_firm.is_platform or user.is_platform_admin:
        raise HTTPException(403, "Bu araç büro çalışma alanı içindir.")
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, "Dosya en fazla 5 MB olabilir; içerik kırpılmadı.")
        raw.extend(chunk)
    try:
        result = await run_in_threadpool(extract_document_isolated, bytes(raw))
    except ExtractionError as exc:
        raise HTTPException(422, str(exc)) from None
    response.headers["Cache-Control"] = "no-store"
    return result
