from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import is_rate_limited, record_attempt
from app.core.security import verify_password
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthConfigOut,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    SetPasswordRequest,
    TokenInfoOut,
    TokenResponse,
)
from app.services.account_service import apply_new_password, deliver, prepare_reset_email
from app.services.auth_service import AuthService
from app.services.firm_access import FIRM_SUSPENDED, firm_is_open
from app.services.password_policy import PasswordPolicyError, validate_password
from app.services.user_token_service import consume_token, find_usable_token

LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış."
FORGOT_PASSWORD_MESSAGE = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi."
FORGOT_PASSWORD_LIMIT = 3

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    limiter_key = f"{client_ip}:{payload.email.lower()}"

    if is_rate_limited(limiter_key, settings.login_rate_limit_per_minute):
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
    # Only someone who knows the password learns that the firm is suspended.
    if not firm_is_open(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FIRM_SUSPENDED)
    token = service.issue_token_for(user)
    return TokenResponse(access_token=token)


@router.get("/config", response_model=AuthConfigOut)
def get_auth_config():
    """Public: lets the login page show the demo accounts hint."""
    return AuthConfigOut(
        demo_mode=settings.seed_demo_data,
        platform_demo=settings.seed_demo_data and settings.env != "production",
    )


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # MVP: JWTs are stateless and short-lived; logout is a client-side
    # token discard. This endpoint exists so the frontend has a clear
    # contract and so we can add server-side revocation later without
    # a breaking API change.
    return {"status": "logged_out"}


@router.post("/forgot-password", response_model=MessageOut, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Always answers with the same status and body, whether or not the address
    is registered. The e-mail is sent after the response (deferred)."""
    client_ip = request.client.host if request.client else "unknown"
    limiter_key = f"forgot:{client_ip}:{payload.email.lower()}"
    if is_rate_limited(limiter_key, FORGOT_PASSWORD_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.",
        )
    record_attempt(limiter_key)

    user = UserRepository(db).get_by_email(payload.email)
    if user is not None and user.is_active and user.password_set_at is not None and firm_is_open(user):
        background_tasks.add_task(deliver, prepare_reset_email(db, user, created_by=None))
    return MessageOut(message=FORGOT_PASSWORD_MESSAGE)


@router.get("/token-info", response_model=TokenInfoOut)
def token_info(token: str = Query(default=""), db: Session = Depends(get_db)):
    found = find_usable_token(db, token)
    if found is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
    row, user = found
    return TokenInfoOut(purpose=row.purpose, email=user.email, full_name=user.full_name)


@router.post("/set-password", response_model=TokenResponse)
def set_password(payload: SetPasswordRequest, db: Session = Depends(get_db)):
    """Chooses the password with an invite or reset link, then logs in."""
    found = find_usable_token(db, payload.token)
    if found is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
    row, user = found
    try:
        validate_password(payload.password, user.email)
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if not consume_token(db, row):
        db.rollback()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
    apply_new_password(db, user, payload.password)
    db.commit()
    return TokenResponse(access_token=AuthService(db).issue_token_for(user))


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a new token: the password change ends all other sessions."""
    limiter_key = f"change-password:{current_user.id}"
    if is_rate_limited(limiter_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin.",
        )
    record_attempt(limiter_key)

    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mevcut şifre hatalı.")
    try:
        validate_password(payload.new_password, current_user.email)
    except PasswordPolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    apply_new_password(db, current_user, payload.new_password)
    db.commit()
    return TokenResponse(access_token=AuthService(db).issue_token_for(current_user))
