"""POST /public/site-chat: the marketing site's "site cat".

Public and anonymous by design. The route has no auth, database or tool
dependency (a test asserts this); its only state is the in-memory limiter.
"""
from typing import Callable, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import settings
from app.site_chat import limits
from app.site_chat.knowledge import load_knowledge
from app.site_chat.provider import build_site_chat_provider
from app.site_chat.service import MAX_ASSISTANT_CHARS, MAX_USER_CHARS, MAX_USER_TURNS, run_turn

router = APIRouter(prefix="/public", tags=["public"])
TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class SiteChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_ASSISTANT_CHARS)

    @model_validator(mode="after")
    def _limits(self):
        if not self.content.strip():
            raise ValueError("Mesaj boş olamaz.")
        if self.role == "user" and len(self.content) > MAX_USER_CHARS:
            raise ValueError(f"Mesaj en fazla {MAX_USER_CHARS} karakter olabilir.")
        return self


class SiteChatRequest(BaseModel):
    # Room for MAX_USER_TURNS questions and their answers plus one extra question,
    # so the turn limit answers with a friendly message instead of a 422.
    messages: list[SiteChatMessage] = Field(min_length=1, max_length=MAX_USER_TURNS * 2 + 3)
    lang: Optional[Literal["tr", "en"]] = None
    turnstile_token: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("messages")
    @classmethod
    def _ends_with_question(cls, value):
        if value[-1].role != "user":
            raise ValueError("Son mesaj ziyaretçinin sorusu olmalıdır.")
        return value


class SiteChatResponse(BaseModel):
    answer: str
    kind: str
    lang: str
    knowledge_version: str


def get_site_chat_provider_factory() -> Callable:
    """Overridable in tests."""
    return build_site_chat_provider


def get_site_chat_limiter() -> limits.SiteChatLimiter:
    return limits.limiter


def _client_ip(request: Request) -> str:
    # Production runs uvicorn with --proxy-headers behind Caddy, so this is the visitor's address.
    return request.client.host if request.client else "unknown"


def _turnstile_ok(token: Optional[str], ip: str) -> bool:
    if not settings.site_chat_turnstile_secret:
        return True
    if not token:
        return False
    try:
        response = httpx.post(
            TURNSTILE_URL, timeout=5.0,
            data={"secret": settings.site_chat_turnstile_secret, "response": token, "remoteip": ip},
        )
        return bool(response.json().get("success"))
    except (httpx.HTTPError, ValueError):
        return False


@router.post("/site-chat", response_model=SiteChatResponse)
def site_chat(
    payload: SiteChatRequest,
    request: Request,
    provider_factory: Callable = Depends(get_site_chat_provider_factory),
    limiter: limits.SiteChatLimiter = Depends(get_site_chat_limiter),
):
    ip = _client_ip(request)
    version = load_knowledge().version
    if not _turnstile_ok(payload.turnstile_token, ip):
        return JSONResponse(status_code=403, content={
            "detail": "Doğrulama başarısız oldu. Sayfayı yenileyip tekrar deneyin.", "code": "verification_failed",
            "knowledge_version": version})
    result = run_turn(
        [m.model_dump() for m in payload.messages], ip=ip, page_lang=payload.lang,
        limiter=limiter, provider_factory=provider_factory,
    )
    if result.status != 200:
        return JSONResponse(status_code=result.status, content={
            "detail": result.answer, "code": result.kind, "lang": result.lang, "knowledge_version": version})
    return SiteChatResponse(answer=result.answer, kind=result.kind, lang=result.lang, knowledge_version=version)
