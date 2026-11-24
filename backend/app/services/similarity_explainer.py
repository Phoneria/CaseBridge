"""Optional short AI explanation for one case/precedent pair (spec 019, stage 3).

The prompt carries only the two stored texts and the extractive explanation; the system
prompt repeats the no-fabrication rule of app/ai/agents/common.py. Calls run in a small
thread pool with a hard deadline, so the endpoint answers on time even when the provider
hangs. Any failure, timeout, empty answer or an answer citing a statute or decision that
is not in either text falls back to an extractive Turkish sentence built from stored data.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass
from typing import Optional

from app.ai.agents.common import NO_FABRICATION_CLAUSE
from app.ai.llm_levels import provider_for
from app.ai.providers.base import LLMProvider
from app.models.case import Case
from app.services.similarity_service import TEXT_FIELDS, Explanation, _ref_matches, statute_refs

log = logging.getLogger(__name__)

TEXT_LIMIT = 3000
ANSWER_LIMIT = 1200
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="similarity-explain")

SYSTEM_PROMPT = (
    "Sen bir hukuk bürosunun emsal arşivinde çalışan yardımcı bir asistansın. "
    "Sana bir dava ile büronun kayıtlı bir emsal kararının metinleri verilecek. "
    "Yalnızca bu iki metne dayanarak, en fazla 4 cümlelik kısa bir Türkçe açıklama yaz: "
    "iki dosya neden benzer ve hangi noktalarda ayrışıyor. Metinlerde geçmeyen hiçbir karar, "
    "içtihat, kanun maddesi, tarih veya tutar yazma; metinde olmayan bir bilgi için tahmin yürütme. "
    + NO_FABRICATION_CLAUSE
)

NOTICES = {
    "unavailable": "Yapay zekâ bağlantısı bu ortamda kapalı; kayıtlı verilerden hazırlanan özet gösteriliyor.",
    "timeout": "Yapay zekâ açıklaması zamanında alınamadı; kayıtlı verilerden hazırlanan özet gösteriliyor.",
    "error": "Yapay zekâ açıklaması alınamadı; kayıtlı verilerden hazırlanan özet gösteriliyor.",
    "rejected": "Yapay zekâ yanıtı metinlerde bulunmayan bir atıf içerdiği için gösterilmedi; "
                "kayıtlı verilerden hazırlanan özet gösteriliyor.",
}


@dataclass
class AIExplanation:
    status: str                # "ai" or "fallback"
    text: str
    notice: Optional[str] = None


@dataclass
class ExplainJob:
    key: str
    source: Case
    precedent: Case
    explanation: Explanation


def case_text(case: Case) -> str:
    parts = []
    for name, label in TEXT_FIELDS:
        value = getattr(case, name, None)
        if value and value.strip():
            parts.append(f"{label}: {value.strip()}")
    return "\n".join(parts)[:TEXT_LIMIT]


def user_prompt(job: ExplainJob) -> str:
    return (
        "DAVA METNİ:\n" + (case_text(job.source) or "(kayıtlı metin yok)") + "\n\n"
        "EMSAL METNİ:\n" + (case_text(job.precedent) or "(kayıtlı metin yok)") + "\n\n"
        "Sistemin bulduğu ortak noktalar (yalnızca bilgi için): "
        + "; ".join(job.explanation.matching_fields + job.explanation.shared_statutes + job.explanation.shared_terms)
    )


def fallback_text(explanation: Explanation) -> str:
    parts = []
    if explanation.matching_fields:
        parts.append("Eşleşen bilgiler: " + ", ".join(explanation.matching_fields) + ".")
    if explanation.shared_statutes:
        parts.append("Ortak atıflar: " + ", ".join(explanation.shared_statutes) + ".")
    if explanation.shared_terms:
        parts.append("Ortak terimler: " + ", ".join(explanation.shared_terms) + ".")
    return " ".join(parts) or "Kayıtlı metinlerde öne çıkan ortak bir nokta bulunamadı."


def _fallback(job: ExplainJob, reason: str) -> AIExplanation:
    return AIExplanation("fallback", fallback_text(job.explanation), NOTICES[reason])


def _grounded(answer: str, job: ExplainJob) -> bool:
    """Every statute or Yargıtay reference in the answer must appear in one of the two texts."""
    known = list(statute_refs(case_text(job.source))) + list(statute_refs(case_text(job.precedent)))
    return all(any(_ref_matches(ref, k) or _ref_matches(k, ref) for k in known) for ref in statute_refs(answer))


def _call(provider: LLMProvider, job: ExplainJob) -> str:
    return provider_for(provider, "similarity.explain").complete(SYSTEM_PROMPT, user_prompt(job))


def explain_pairs(provider: Optional[LLMProvider], jobs: list[ExplainJob], timeout: float) -> dict[str, AIExplanation]:
    """One explanation per job, all within `timeout` seconds in total. Never raises."""
    if not jobs:
        return {}
    if provider is None:
        return {job.key: _fallback(job, "unavailable") for job in jobs}
    futures = {job.key: _POOL.submit(_call, provider, job) for job in jobs}
    wait(list(futures.values()), timeout=timeout)
    out: dict[str, AIExplanation] = {}
    for job in jobs:
        future = futures[job.key]
        if not future.done():
            future.cancel()
            out[job.key] = _fallback(job, "timeout")
            continue
        try:
            answer = " ".join((future.result() or "").split())
        except Exception as exc:  # provider errors must never fail the endpoint
            log.warning("similarity explanation failed: %s", type(exc).__name__)
            out[job.key] = _fallback(job, "error")
            continue
        if not answer:
            out[job.key] = _fallback(job, "error")
        elif not _grounded(answer, job):
            out[job.key] = _fallback(job, "rejected")
        else:
            out[job.key] = AIExplanation("ai", answer[:ANSWER_LIMIT])
    return out
