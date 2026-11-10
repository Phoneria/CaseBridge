"""System status endpoints (Phase 4 - Ayarlar). Read-only, no secrets
leaked - reuses the same get_ai_provider_status() the app startup
lifespan (app/main.py) already logs from.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.ai.connectivity import get_ai_connectivity, reset_cache
from app.ai.provider_factory import get_ai_provider_status
from app.api.deps import get_current_user, get_current_admin, ai_credential_scope
from app.core.rate_limit import is_rate_limited, record_attempt
from app.db.session import get_db
from app.models.user import User
from app.schemas.system import AIConnectivityOut, AIKeyStatusOut, AIStatusOut, AIUsageOut
from app.services.ai_credentials import CredentialError, activate_openai_api_key, key_status, save_openai_api_key
from app.services.ai_usage_service import get_ai_usage

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/openai-key", response_model=AIKeyStatusOut)
def openai_key_status(response: Response, actor: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    return key_status(ai_credential_scope(actor))


@router.put("/openai-key", response_model=AIKeyStatusOut)
async def update_openai_key(request: Request, response: Response, actor: User = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-store"
    limiter = f"ai-key:{actor.id}"
    if is_rate_limited(limiter, max_attempts=5):
        raise HTTPException(429, "Çok fazla deneme. Bir dakika sonra yeniden deneyin.")
    record_attempt(limiter)
    # Parse explicitly: FastAPI's default validation errors can echo a secret
    # input back to the client. Neither validation nor upstream errors may do so.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 4096:
            raise HTTPException(413, "Anahtar isteği çok büyük.")
    try:
        payload = json.loads(body)
        api_key = payload.get("api_key") if isinstance(payload, dict) else None
        if not isinstance(api_key, str):
            raise ValueError()
        api_key = api_key.strip()
        if not (20 <= len(api_key) <= 512 and api_key.startswith("sk-") and not any(c.isspace() for c in api_key)):
            raise ValueError()
    except (ValueError, UnicodeError):
        raise HTTPException(400, "Geçerli bir OpenAI API anahtarı girin.") from None
    scope = ai_credential_scope(actor)
    if not key_status(scope)["can_save"]:
        raise HTTPException(503, "Güvenli anahtar yönetimi sunucuda etkinleştirilmemiş.")
    try:
        await run_in_threadpool(save_openai_api_key, api_key, scope)
    except CredentialError as exc:
        raise HTTPException(400, str(exc)) from None
    logging.getLogger("casebridge").info("AI credential staged actor=%s", actor.id)
    return key_status(scope)


@router.post("/openai-key/activate", response_model=AIConnectivityOut)
def activate_openai_key(response: Response, actor: User = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-store"
    limiter = f"ai-key:{actor.id}"
    if is_rate_limited(limiter, max_attempts=5):
        raise HTTPException(429, "Çok fazla deneme. Bir dakika sonra yeniden deneyin.")
    record_attempt(limiter)
    try:
        activate_openai_api_key(ai_credential_scope(actor))
    except CredentialError as exc:
        raise HTTPException(400, str(exc)) from None
    reset_cache(ai_credential_scope(actor))
    logging.getLogger("casebridge").info("AI credential activated actor=%s", actor.id)
    return get_ai_connectivity(force=True, law_firm_id=ai_credential_scope(actor))


@router.get("/ai-status", response_model=AIStatusOut)
def ai_status(current_user: User = Depends(get_current_user)):
    return AIStatusOut(**get_ai_provider_status(ai_credential_scope(current_user)))


@router.get("/ai-connectivity", response_model=AIConnectivityOut)
def ai_connectivity(force: bool = False, current_user: User = Depends(get_current_user)):
    return AIConnectivityOut(**get_ai_connectivity(force=force, law_firm_id=ai_credential_scope(current_user)))


@router.get("/ai-usage", response_model=AIUsageOut)
def ai_usage(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return AIUsageOut(**get_ai_usage(db, current_user.law_firm_id))
