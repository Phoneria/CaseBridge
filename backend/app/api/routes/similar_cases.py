"""Similar cases (stage 1): same-bureau cases and the bureau's precedent archive.

Access follows the existing read rules: the session's bureau is the only scope
(another bureau's case is a 404), and a user who may read the source case
through GET /cases/{id} may read these results, which come from the same set
GET /cases?include_archived=true and GET /precedents expose to them.
"""
from dataclasses import asdict
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.providers.base import LLMProvider
from app.api.deps import get_current_law_firm_id, get_similarity_llm_provider
from app.core.config import settings
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.case import CaseOutcome, CasePrecedentLink
from app.schemas.similar_case import (
    AIExplanationOut, DifferenceOut, FactsOut, HighlightOut, PassagePairOut, ScoreComponentOut, SimilarCaseOut,
    SimilarCaseSearch, SimilarityExplanationOut, SimilarPrecedentDetailOut, SimilarPrecedentOut,
    SimilarPrecedentsResponse, SimilarPrecedentsSummaryOut, TimelineEventOut,
)
from app.services.case_service import CaseService
from app.services.similar_cases import Match, SimilarCaseService, duration_days, turkish_lower
from app.services.similarity_explainer import ExplainJob, explain_pairs
from app.services.similarity_insights import CaseRecords, Facts, key_differences, summarize
from app.services.similarity_service import PrecedentMatch, SimilarityService

cases_router = APIRouter(prefix="/cases", tags=["similar-cases"])
search_router = APIRouter(prefix="/similar-cases", tags=["similar-cases"])


def _out(matches: list[Match]) -> list[SimilarCaseOut]:
    today = local_today()
    rows = []
    for match in matches:
        case = match.case
        days, ongoing = duration_days(case, today)
        rows.append(SimilarCaseOut(
            case_id=case.id, case_number=case.case_number, case_name=case.case_name,
            case_type=case.case_type, status=case.status, outcome=case.outcome,
            decision_date=case.decision_date, duration_days=days, duration_ongoing=ongoing,
            assigned_lawyer_name=case.assigned_lawyer_name, is_precedent=bool(case.is_precedent),
            score=match.score, reasons=match.reasons,
        ))
    return rows


@cases_router.get("/{case_id}/similar", response_model=list[SimilarCaseOut])
def similar_to_case(
    case_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    source = CaseService(db).get_case(case_id, law_firm_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return _out(SimilarCaseService(db).for_case(source, limit))


@search_router.post("/search", response_model=list[SimilarCaseOut])
def search_similar(
    payload: SimilarCaseSearch,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _out(SimilarCaseService(db).for_text(law_firm_id, payload.text, payload.case_type, payload.limit))


def _precedent_out(match: PrecedentMatch, linked: set[str]) -> SimilarPrecedentOut:
    p, why = match.precedent, match.explanation
    return SimilarPrecedentOut(
        precedent_id=p.id, case_number=p.case_number, case_name=p.case_name, case_type=p.case_type,
        court=p.court, outcome=p.outcome, decision_date=p.decision_date,
        score=match.score, text_score=match.text_score, linked_to_case=p.id in linked,
        explanation=SimilarityExplanationOut(
            shared_terms=why.shared_terms, shared_statutes=why.shared_statutes,
            matching_fields=why.matching_fields,
            passages=[PassagePairOut(
                case_label=x.case_label, case_text=x.case_text,
                case_highlights=[HighlightOut(start=h.start, end=h.end) for h in x.case_highlights],
                precedent_label=x.precedent_label, precedent_text=x.precedent_text,
                precedent_highlights=[HighlightOut(start=h.start, end=h.end) for h in x.precedent_highlights],
            ) for x in why.passages],
        ),
    )


def _facts_out(f: Facts) -> FactsOut:
    return FactsOut(**asdict(f))


def _same_court(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a and b) and " ".join(turkish_lower(a).split()) == " ".join(turkish_lower(b).split())


@cases_router.get("/{case_id}/similar-precedents", response_model=SimilarPrecedentsResponse)
def similar_precedents(
    case_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    outcome: Optional[list[CaseOutcome]] = Query(default=None),
    court: Optional[str] = Query(default=None, max_length=255),
    min_score: int = Query(default=0, ge=0, le=100),
    explain: bool = Query(default=False),
    precedent_id: Optional[str] = Query(default=None, max_length=36),
    law_firm_id: str = Depends(get_current_law_firm_id),
    llm: Callable[[], Optional[LLMProvider]] = Depends(get_similarity_llm_provider),
    db: Session = Depends(get_db),
):
    """The bureau's own precedents ranked against one of its cases.

    Filters (outcome, court, min_score, precedent_id) narrow the ranked list; the summary covers
    every match after the filters, the items the first `limit`. `explain=true` adds a short AI
    explanation per item, bounded by SIMILARITY_EXPLAIN_TIMEOUT_SECONDS with an extractive fallback.
    """
    source = CaseService(db).get_case(case_id, law_firm_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    service = SimilarityService(db)
    ranking = service.rank(source)
    courts = sorted({r[2].court.strip() for r in ranking.rows if r[2].court and r[2].court.strip()},
                    key=turkish_lower)
    wanted = {o.value for o in outcome} if outcome else None
    rows = [
        r for r in ranking.rows
        if min(round(100 * r[0]), 100) >= min_score
        and (wanted is None or r[2].outcome.value in wanted)
        and (not court or _same_court(r[2].court, court))
        and (not precedent_id or r[2].id == precedent_id)
    ]
    summary = summarize([r[2] for r in rows], courts)
    matches = [service.explain(source, ranking, r) for r in rows[:limit]]

    records = CaseRecords(db, law_firm_id, [source.id] + [m.precedent.id for m in matches])
    source_facts = records.facts(source, ranking.source_profile)
    linked = {row[0] for row in db.query(CasePrecedentLink.precedent_id).filter_by(
        law_firm_id=law_firm_id, case_id=source.id).all()}

    ai: dict = {}
    if explain and matches:
        jobs = [ExplainJob(m.precedent.id, source, m.precedent, m.explanation) for m in matches]
        ai = explain_pairs(llm(), jobs, settings.similarity_explain_timeout_seconds)

    items = []
    for m in matches:
        facts = records.facts(m.precedent, m.profile)
        base = _precedent_out(m, linked)
        items.append(SimilarPrecedentDetailOut(
            **base.model_dump(),
            case_value=facts.case_value,
            duration_months=facts.duration_months,
            score_breakdown=[ScoreComponentOut(**asdict(c)) for c in m.breakdown],
            key_differences=[DifferenceOut(**asdict(d)) for d in key_differences(source_facts, facts)],
            timeline=[TimelineEventOut(**asdict(e)) for e in records.events.get(m.precedent.id, [])],
            facts=_facts_out(facts),
            ai_explanation=AIExplanationOut(**asdict(ai[m.precedent.id])) if m.precedent.id in ai else None,
        ))
    return SimilarPrecedentsResponse(
        summary=SimilarPrecedentsSummaryOut(**asdict(summary), excluded_signals=ranking.excluded),
        source=_facts_out(source_facts),
        items=items,
    )
