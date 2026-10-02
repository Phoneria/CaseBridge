from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.ai.chat.base import ChatProvider
from app.ai.chat.factory import get_chat_provider
from app.ai.provider_factory import get_llm_provider
from app.ai.providers.base import LLMProvider
from app.core.security import decode_access_token
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository

_bearer_scheme = HTTPBearer(auto_error=False)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _CREDENTIALS_EXCEPTION
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    user_id = payload.get("sub")
    if user_id is None:
        raise _CREDENTIALS_EXCEPTION

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXCEPTION
    return user


def get_current_law_firm_id(current_user: User = Depends(get_current_user)) -> str:
    """The single source of truth for tenant scoping on every protected
    route. Never accept law_firm_id from the client / path / query."""
    return current_user.law_firm_id


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def get_llm_provider_dep() -> LLMProvider:
    """FastAPI dependency wrapping the provider factory - overridable in
    tests via app.dependency_overrides so no test ever needs a real
    OPENAI_API_KEY or hits the network."""
    return get_llm_provider()


def get_chat_provider_resolver() -> Callable[[str], ChatProvider]:
    """Returns level -> configured chat provider (raises AIProviderConfigError
    when misconfigured). Overridable in tests."""
    return get_chat_provider


def get_chat_session_factory() -> Callable[[], Session]:
    """Session factory used to persist the streamed reply after the request
    session has closed. Overridden in tests to reuse the test session."""
    return SessionLocal
