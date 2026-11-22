"""Legal lab: knowledge map, counter-side analysis and the directed courtroom simulation.

Works without an AI key (predetermined mock content, labelled as such); with a key the same
endpoints call the firm's model.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.errors import AIProviderConfigError
from app.ai.provider_factory import get_llm_provider
from app.ai.providers.base import LLMProvider
from app.api.deps import ai_credential_scope, get_current_law_firm_id, get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.legal_lab import mock, service
from app.legal_lab.graph import get_graph
from app.models.user import User
from app.services.case_service import CaseService

router = APIRouter(prefix="/legal-lab", tags=["legal-lab"])

Side = Literal["davaci", "davali", "hakim"]


def get_optional_provider(current_user: User = Depends(get_current_user)) -> Optional[LLMProvider]:
    """None means "use the predetermined mock": mock mode, or a real provider without a usable key."""
    if settings.llm_provider == "mock":
        return None
    try:
        return get_llm_provider(ai_credential_scope(current_user))
    except AIProviderConfigError:
        return None


class Turn(BaseModel):
    who: str = Field(max_length=20)
    text: str = Field(default="", max_length=2000)
    stage_name: str = Field(default="", max_length=80)


class CaseRef(BaseModel):
    case_id: Optional[str] = Field(default=None, max_length=36)
    summary: Optional[str] = Field(default=None, max_length=9000)


def _summary(db: Session, ref: CaseRef, law_firm_id: str) -> str:
    if ref.case_id:
        case = CaseService(db).get_case(ref.case_id, law_firm_id)
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
        parts = [f"Dava: {case.case_name}", f"Tür: {case.case_type.value}", f"Müvekkil: {case.client_name}",
                 f"Karşı taraf: {case.opposing_party or '-'}", f"Mahkeme: {case.court or '-'}"]
        for label, val in (("Talep", case.claim), ("Olaylar", case.facts_summary), ("Davacı tutumu", case.plaintiff_position),
                           ("Davalı tutumu", case.defendant_position), ("Açıklama", case.description)):
            if val:
                parts.append(f"{label}: {val}")
        return "\n".join(parts)[:9000]
    if ref.summary and ref.summary.strip():
        return ref.summary.strip()
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="case_id or summary is required")


@router.get("/status")
def lab_status(provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    return {"mode": "mock" if provider is None else "ai", "note": mock.MOCK_NOTE if provider is None else None,
            "stages": mock.STAGES, "chars": mock.CHARS}


@router.get("/map")
def legal_map(_: User = Depends(get_current_user)):
    return get_graph()


class CounterBody(CaseRef):
    side: Literal["davaci", "davali"] = "davaci"


@router.post("/counter-analysis")
def counter_analysis(body: CounterBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                     provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    return service.counter_analysis(provider, _summary(db, body, user.law_firm_id), body.side)


class Interv(BaseModel):
    mode: Literal["order", "say", "direct", "puppet", "hukum", "aside"]
    target: Optional[str] = Field(default=None, max_length=20)
    text: str = Field(default="", max_length=1500)
    sonuc: Optional[Literal["kabul", "kismen_kabul", "red"]] = None


class BeatBody(CaseRef):
    side: Side = "davaci"
    stage_idx: int = Field(default=0, ge=0, le=4)
    transcript: list[Turn] = Field(default_factory=list, max_length=200)
    interv: Optional[Interv] = None
    manual: list[str] = Field(default_factory=list, max_length=4)


@router.post("/trial/beat")
def trial_beat(body: BeatBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
               provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    summary = _summary(db, body, user.law_firm_id)
    return service.trial_beat(provider, summary, body.side, body.stage_idx, [t.model_dump() for t in body.transcript],
                              body.interv.model_dump() if body.interv else None, body.manual)


class GuideBody(CaseRef):
    role: Side = "hakim"
    stage_idx: int = Field(default=0, ge=0, le=4)
    transcript: list[Turn] = Field(default_factory=list, max_length=200)


@router.post("/trial/guide")
def trial_guide(body: GuideBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    summary = _summary(db, body, user.law_firm_id)
    return service.trial_guide(provider, summary, [t.model_dump() for t in body.transcript], body.stage_idx, body.role)


class AskBody(CaseRef):
    side: Side = "davaci"
    question: str = Field(min_length=1, max_length=1000)
    transcript: list[Turn] = Field(default_factory=list, max_length=200)


@router.post("/trial/ask")
def trial_ask(body: AskBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
              provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    summary = _summary(db, body, user.law_firm_id)
    return service.trial_ask(provider, summary, body.side, [t.model_dump() for t in body.transcript], body.question)


# ------------------------------------------------------------------ Emsal arama
from app.legal_lab import precedents  # noqa: E402


class PrecedentFilters(BaseModel):
    kinds: list[Literal["yargitay", "bam", "ilk_derece"]] = Field(default_factory=list, max_length=3)
    outcomes: list[str] = Field(default_factory=list, max_length=12)
    year_min: Optional[int] = Field(default=None, ge=1960, le=2100)
    year_max: Optional[int] = Field(default=None, ge=1960, le=2100)
    court: Optional[str] = Field(default=None, max_length=60)


class PrecedentSearchBody(CaseRef):
    query: Optional[str] = Field(default=None, max_length=4000)
    k: int = Field(default=10, ge=1, le=30)
    filters: PrecedentFilters = Field(default_factory=PrecedentFilters)


@router.get("/precedents/status")
def precedents_status(_: User = Depends(get_current_user)):
    return precedents.status()


@router.post("/precedents/search")
def precedents_search(body: PrecedentSearchBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.query and body.query.strip():
        text = body.query.strip()
    else:
        text = _summary(db, body, user.law_firm_id)
    res = precedents.search(text, body.k, body.filters.model_dump(exclude_none=True))
    note = "Örnek emsal veri seti; gerçek indeks kurulmadı." if res["mode"] == "sample" else None
    return {**res, "query": text[:300], "note": note}


@router.get("/precedents/{doc_id:path}")
def precedents_detail(doc_id: str, _: User = Depends(get_current_user)):
    d = precedents.detail(doc_id)
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precedent not found")
    return d


class PrecedentExplainBody(CaseRef):
    query: Optional[str] = Field(default=None, max_length=4000)
    doc_ids: list[str] = Field(min_length=1, max_length=8)


@router.post("/precedents-explain")
def precedents_explain(body: PrecedentExplainBody, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                       provider: Optional[LLMProvider] = Depends(get_optional_provider)):
    text = body.query.strip() if body.query and body.query.strip() else _summary(db, body, user.law_firm_id)
    items = [d for d in (precedents.detail(i) for i in body.doc_ids) if d]
    for it in items:
        it["snippet"] = (it.get("narr") or it["snippet"])[:900]
        it["matched"] = it.get("matched") or [t for t in dict.fromkeys(precedents.tokens(text)) if t in set(precedents.tokens(it["snippet"]))][:6]
    return service.precedent_explain(provider, text, items)
