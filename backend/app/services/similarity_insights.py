"""Facts, rule-based differences, timelines and the summary for "Benzer Davalar" (spec 019, stage 3).

Everything here is read from stored rows of the requesting bureau: case fields, case events
(CaseEvent) and uploaded documents. Nothing is generated; a value that is not stored is
reported as missing rather than guessed.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent, CaseEventType
from app.models.document import Document
from app.services.similar_cases import CASE_TYPE_LABELS, court_type
from app.services.similarity_service import Profile

DAYS_PER_MONTH = 30.4375
TIMELINE_LIMIT = 25
CLIENT_ROLE_LABELS = {"plaintiff": "Davacı", "defendant": "Davalı", "other": "Diğer"}
EXPERT_REPORT = "Bilirkişi raporu"


def duration_months(case: Case) -> Optional[float]:
    """Months from opening to decision, one decimal; None unless both dates are stored and ordered."""
    if not case.opening_date or not case.decision_date or case.decision_date < case.opening_date:
        return None
    return round((case.decision_date - case.opening_date).days / DAYS_PER_MONTH, 1)


@dataclass
class TimelineEvent:
    event_date: date
    event_type: str
    title: str


@dataclass
class Facts:
    case_type: str
    court: Optional[str]
    court_type: Optional[str]
    client_role: Optional[str]
    case_value: Optional[float]
    opening_date: Optional[date]
    decision_date: Optional[date]
    duration_months: Optional[float]
    outcome: str
    evidence: list[str]
    has_expert_report: bool
    document_count: int
    statutes: list[str]


@dataclass
class Difference:
    label: str
    case_value: str
    precedent_value: str


@dataclass
class Summary:
    count: int
    outcomes: dict[str, int]
    avg_duration_months: Optional[float]
    duration_count: int
    avg_case_value: Optional[float]
    value_count: int
    available_courts: list[str] = field(default_factory=list)


class CaseRecords:
    """Bureau-scoped events and document counts for a set of case ids, loaded in two queries."""

    def __init__(self, db: Session, firm_id: str, case_ids: Iterable[str]):
        ids = list(dict.fromkeys(case_ids))
        self.events: dict[str, list[TimelineEvent]] = {}
        self.expert: set[str] = set()
        self.documents: dict[str, int] = {}
        if not ids:
            return
        rows = (
            db.query(CaseEvent.case_id, CaseEvent.event_date, CaseEvent.event_type, CaseEvent.title)
            .filter(CaseEvent.law_firm_id == firm_id, CaseEvent.case_id.in_(ids))
            .order_by(CaseEvent.event_date, CaseEvent.created_at, CaseEvent.id)
            .all()
        )
        for case_id, event_date, event_type, title in rows:
            kind = event_type.value if hasattr(event_type, "value") else str(event_type)
            if kind == CaseEventType.EXPERT_REPORT.value:
                self.expert.add(case_id)
            bucket = self.events.setdefault(case_id, [])
            if len(bucket) < TIMELINE_LIMIT:
                bucket.append(TimelineEvent(event_date, kind, title))
        for case_id, count in (
            db.query(Document.case_id, func.count(Document.id))
            .filter(Document.law_firm_id == firm_id, Document.case_id.in_(ids))
            .group_by(Document.case_id)
            .all()
        ):
            self.documents[case_id] = int(count)

    def facts(self, case: Case, profile: Profile) -> Facts:
        evidence = list(profile.evidence)
        return Facts(
            case_type=case.case_type.value if hasattr(case.case_type, "value") else str(case.case_type),
            court=case.court or None,
            court_type=court_type(case.court),
            client_role=case.client_role or None,
            case_value=_value(case),
            opening_date=case.opening_date,
            decision_date=case.decision_date,
            duration_months=duration_months(case),
            outcome=case.outcome.value if hasattr(case.outcome, "value") else str(case.outcome),
            evidence=evidence,
            has_expert_report=case.id in self.expert or EXPERT_REPORT in evidence,
            document_count=self.documents.get(case.id, 0),
            statutes=list(profile.refs),
        )


def _money(value: float) -> str:
    return f"{value:,.0f} TL".replace(",", ".")


def key_differences(case: Facts, precedent: Facts) -> list[Difference]:
    """Rule-based differences between two fact sheets. A rule fires only when both sides are stored."""
    out: list[Difference] = []
    if case.case_type != precedent.case_type:
        out.append(Difference("Kategori", CASE_TYPE_LABELS.get(case.case_type, case.case_type),
                              CASE_TYPE_LABELS.get(precedent.case_type, precedent.case_type)))
    if case.client_role and precedent.client_role and case.client_role != precedent.client_role:
        out.append(Difference("Müvekkil rolü", CLIENT_ROLE_LABELS.get(case.client_role, case.client_role),
                              CLIENT_ROLE_LABELS.get(precedent.client_role, precedent.client_role)))
    if case.court_type and precedent.court_type and case.court_type != precedent.court_type:
        out.append(Difference("Mahkeme türü", case.court_type, precedent.court_type))
    if case.has_expert_report != precedent.has_expert_report:
        out.append(Difference("Bilirkişi raporu", "Var" if case.has_expert_report else "Yok",
                              "Var" if precedent.has_expert_report else "Yok"))
    evidence = [e for e in case.evidence if e != EXPERT_REPORT]
    other = [e for e in precedent.evidence if e != EXPERT_REPORT]
    only_case = [e for e in evidence if e not in other]
    only_precedent = [e for e in other if e not in evidence]
    if only_case or only_precedent:
        out.append(Difference("Delil türleri", ", ".join(only_case) or "—", ", ".join(only_precedent) or "—"))
    if bool(case.document_count) != bool(precedent.document_count):
        out.append(Difference("Yüklenen belge", f"{case.document_count} belge" if case.document_count else "Belge yok",
                              f"{precedent.document_count} belge" if precedent.document_count else "Belge yok"))
    if case.case_value and precedent.case_value and min(case.case_value, precedent.case_value) / max(
            case.case_value, precedent.case_value) < 0.5:
        out.append(Difference("Dava değeri", _money(case.case_value), _money(precedent.case_value)))
    return out


def _value(case: Case) -> Optional[float]:
    return case.case_value if case.case_value and case.case_value > 0 else None


def summarize(cases: list[Case], available_courts: list[str]) -> Summary:
    """Counts and averages over the matched precedents; an average only uses rows that store the value."""
    durations = [d for d in (duration_months(c) for c in cases) if d is not None]
    values = [v for v in (_value(c) for c in cases) if v is not None]
    outcomes = Counter(c.outcome.value if hasattr(c.outcome, "value") else str(c.outcome) for c in cases)
    return Summary(
        count=len(cases),
        outcomes=dict(outcomes),
        avg_duration_months=round(sum(durations) / len(durations), 1) if durations else None,
        duration_count=len(durations),
        avg_case_value=round(sum(values) / len(values), 2) if values else None,
        value_count=len(values),
        available_courts=available_courts,
    )
