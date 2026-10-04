"""System status endpoints (Phase 4 - Ayarlar). Read-only, no secrets
leaked - reuses the same get_ai_provider_status() the app startup
lifespan (app/main.py) already logs from.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.connectivity import get_ai_connectivity
from app.ai.provider_factory import get_ai_provider_status
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.system import AIConnectivityOut, AIStatusOut, AIUsageOut
from app.services.ai_usage_service import get_ai_usage

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/ai-status", response_model=AIStatusOut)
def ai_status(current_user: User = Depends(get_current_user)):
    return AIStatusOut(**get_ai_provider_status())


@router.get("/ai-connectivity", response_model=AIConnectivityOut)
def ai_connectivity(force: bool = False, current_user: User = Depends(get_current_user)):
    return AIConnectivityOut(**get_ai_connectivity(force=force))


@router.get("/ai-usage", response_model=AIUsageOut)
def ai_usage(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return AIUsageOut(**get_ai_usage(db, current_user.law_firm_id))
