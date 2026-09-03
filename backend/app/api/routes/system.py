"""System status endpoints (Phase 4 - Ayarlar). Read-only, no secrets
leaked - reuses the same get_ai_provider_status() the app startup
lifespan (app/main.py) already logs from.
"""
from fastapi import APIRouter, Depends

from app.ai.provider_factory import get_ai_provider_status
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.system import AIStatusOut

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/ai-status", response_model=AIStatusOut)
def ai_status(current_user: User = Depends(get_current_user)):
    return AIStatusOut(**get_ai_provider_status())
