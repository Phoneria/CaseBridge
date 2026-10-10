from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import is_rate_limited, record_attempt
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthConfigOut, LoginRequest, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    limiter_key = f"{client_ip}:{payload.email.lower()}"

    if is_rate_limited(limiter_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.",
        )

    record_attempt(limiter_key)

    service = AuthService(db)
    user = service.authenticate(payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı.",
        )
    token = service.issue_token_for(user)
    return TokenResponse(access_token=token)


@router.get("/config", response_model=AuthConfigOut)
def get_auth_config():
    """Public: lets the login page show the demo accounts hint."""
    return AuthConfigOut(demo_mode=settings.seed_demo_data)


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # MVP: JWTs are stateless and short-lived; logout is a client-side
    # token discard. This endpoint exists so the frontend has a clear
    # contract and so we can add server-side revocation later without
    # a breaking API change.
    return {"status": "logged_out"}
