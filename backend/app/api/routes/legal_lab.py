"""Legal lab: knowledge map, counter-side analysis and the directed courtroom simulation.

Works without an AI key (predetermined mock content, labelled as such); with a key the same
endpoints call the firm's model.
"""
import json
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
from app.legal_lab.scenario_tree import ScenarioTree, build_tree
from app.legal_lab.scenario_demo import build_demo, DocumentAssumption, PaymentAssumption
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


@router.get('/cases/{case_id}/scenario-tree', response_model=ScenarioTree)
def case_scenario_tree(case_id: str, assumptions: str = "{}", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Read existing scoped case material; never starts an AI/provider request."""
    if user.is_platform_admin:
        raise HTTPException(status_code=403, detail='Bu araç hukuk bürosu çalışma alanına aittir.')
    case = CaseService(db).get_case(case_id, user.law_firm_id)
    if case is None:
        raise HTTPException(status_code=404, detail='Case not found')
    try:
        if len(assumptions) > 2000:
            raise ValueError('Too many assumptions')
        values = json.loads(assumptions)
        if not isinstance(values, dict) or len(values) > 6:
            raise ValueError('Invalid assumptions')
        return build_tree(db, case, user.law_firm_id, values)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail='Geçersiz senaryo varsayımı.')


@router.get('/scenario-demo', response_model=ScenarioTree)
def synthetic_scenario_demo(document: DocumentAssumption = 'unreviewed', payment: PaymentAssumption = 'unknown', user: User = Depends(get_current_user)):
    """Code-owned fixture only: no real case/firm/analysis input or provider call."""
    if user.is_platform_admin:
        raise HTTPException(status_code=403, detail='Bu araç hukuk bürosu çalışma alanına aittir.')
    return build_demo(document, payment)
