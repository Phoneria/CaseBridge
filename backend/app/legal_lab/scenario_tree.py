"""Read-only, tenant-scoped scenario tree. No provider calls or numeric probabilities.

Stored scenario text is reused without inventing links between unrelated list items.
Conditional preparation paths are explicit when no substantive analysis exists.
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent, CaseStatus
from app.models.document import Document
from app.models.simulation import AIAnalysis, AnalysisType, Simulation, SimulationStatus

LIMIT = 60


def text(value, length=4000):
    return value.strip()[:length] if isinstance(value, str) else ''


def strings(value, limit=20):
    if not isinstance(value, list):
        return []
    return list(dict.fromkeys(text(v) for v in value if text(v)))[:limit]


class TreeSource(BaseModel):
    id: str = Field(max_length=160)
    kind: Literal['case', 'event', 'document', 'analysis']
    label: str = Field(max_length=4000)
    detail: str = Field(max_length=4000)
    recorded_at: str | None = None


class TreeNode(BaseModel):
    id: str = Field(max_length=160)
    parent_id: str | None
    kind: Literal['context', 'development', 'outcome', 'scenario']
    label: str = Field(max_length=4000)
    description: str = Field(max_length=4000)
    reasoning: str = Field(max_length=4000)
    source_ids: list[str] = Field(max_length=64)
    uncertainties: list[str] = Field(max_length=20)
    probability: Literal[None] = None
    assessment_label: Literal['Hesaplanmadı'] = 'Hesaplanmadı'


class ScenarioTree(BaseModel):
    case_id: str
    title: str
    case_closed: bool
    context_version: str = Field(pattern=r'^[0-9a-f]{64}$')
    generated_at: datetime
    source_mode: Literal['stored_analysis', 'conditional_preparation']
    analysis_id: str | None = None
    analysis_created_at: str | None = None
    is_example: bool = False
    nodes: list[TreeNode] = Field(max_length=25)
    sources: list[TreeSource] = Field(max_length=144)
    current_facts: list[str] = Field(max_length=80)
    uncertainties: list[str] = Field(max_length=20)
    truncated: bool
    limits_note: str
    disclaimer: str

    @model_validator(mode='after')
    def references(self):
        ids = {n.id for n in self.nodes}
        sources = {s.id for s in self.sources}
        if len(ids) != len(self.nodes) or len(sources) != len(self.sources):
            raise ValueError('Duplicate tree identifiers')
        if sum(n.parent_id is None for n in self.nodes) != 1:
            raise ValueError('Tree must have exactly one root')
        for node in self.nodes:
            if node.parent_id is not None and node.parent_id not in ids:
                raise ValueError('Unknown parent')
            seen, parent = {node.id}, node.parent_id
            while parent is not None:
                if parent in seen:
                    raise ValueError('Tree contains a cycle')
                seen.add(parent)
                ancestor = next((n for n in self.nodes if n.id == parent), None)
                if ancestor is None:
                    raise ValueError('Unknown ancestor')
                parent = ancestor.parent_id
            if not set(node.source_ids).issubset(sources):
                raise ValueError('Unknown source')
        return self


def build_tree(db: Session, case: Case, firm_id: str) -> ScenarioTree:
    """Caller resolves case with CaseService; every child query is scoped again."""
    sources = [TreeSource(id='case', kind='case', label=text(case.case_name), detail=f'Dosya: {case.case_number}', recorded_at=str(case.updated_at))]
    facts, fingerprint = [], {'case': {}, 'events': [], 'documents': []}
    for key, label in [('facts_summary', 'Kaydedilen olaylar'), ('claim', 'Talep'), ('description', 'Dosya açıklaması'),
                       ('plaintiff_position', 'Davacı tutumu'), ('defendant_position', 'Davalı tutumu')]:
        value = getattr(case, key)
        fingerprint['case'][key] = value
        if text(value):
            source_id = 'case:' + key
            sources.append(TreeSource(id=source_id, kind='case', label=label, detail=text(value)))
            facts.append(label + ': ' + text(value))
    for key in ['id', 'case_name', 'case_number', 'status', 'outcome', 'updated_at']:
        value = getattr(case, key)
        fingerprint['case'][key] = getattr(value, 'value', str(value))
    if not facts:
        facts.append('Bu dosyada ayrıntılı olay özeti henüz kaydedilmemiş.')

    events = db.query(CaseEvent).filter(CaseEvent.case_id == case.id, CaseEvent.law_firm_id == firm_id).order_by(CaseEvent.event_date.desc(), CaseEvent.id).limit(LIMIT + 1).all()
    for event in events[:LIMIT]:
        sources.append(TreeSource(id='event:' + event.id, kind='event', label=text(event.title), detail=text(event.description), recorded_at=str(event.event_date)))
        facts.append(f'{event.event_date}: {text(event.title)}')
        fingerprint['events'].append([event.id, str(event.event_date), event.title, event.description])
    document_count = 0
    for document in db.query(Document).filter(Document.case_id == case.id, Document.law_firm_id == firm_id).order_by(Document.uploaded_at.desc(), Document.id).limit(LIMIT + 1).yield_per(1):
        document_count += 1
        if document_count > LIMIT:
            break
        sources.append(TreeSource(id='document:' + document.id, kind='document', label=text(document.filename), detail='Yüklenen dosya kaydı; belge içeriği ve doğruluğu ayrıca incelenmelidir.', recorded_at=str(document.uploaded_at)))
        # Hash content without returning document text or its private storage path.
        content_hash = hashlib.sha256((document.extracted_text or '').encode()).hexdigest()
        fingerprint['documents'].append([document.id, document.filename, str(document.uploaded_at), content_hash])

    latest = db.query(AIAnalysis, Simulation).join(Simulation, AIAnalysis.simulation_id == Simulation.id).filter(
        AIAnalysis.case_id == case.id, AIAnalysis.law_firm_id == firm_id,
        Simulation.case_id == case.id, Simulation.law_firm_id == firm_id,
        Simulation.status == SimulationStatus.COMPLETED,
        AIAnalysis.analysis_type == AnalysisType.SIMULATION_REPORT,
    ).order_by(AIAnalysis.created_at.desc(), AIAnalysis.id.desc()).first()
    analysis, simulation = latest if latest else (None, None)
    scenarios = strings(analysis.possible_scenarios, 6) if analysis else []
    has_analysis = bool(scenarios)
    uncertainties = []
    if has_analysis:
        uncertainties = strings(strings(analysis.missing_information) + strings(analysis.opposing_arguments) + strings(analysis.questions))
        sources.append(TreeSource(id='analysis:' + analysis.id, kind='analysis', label='Kayıtlı dosya analizi', detail=text(analysis.summary), recorded_at=str(analysis.created_at)))
    if not text(case.facts_summary):
        uncertainties.append('Ayrıntılı olay özeti eksik veya ayrıca doğrulanmalı.')
    if not document_count:
        uncertainties.append('Bu dosyaya yüklenmiş belge kaydı bulunamadı.')
    uncertainties = list(dict.fromkeys(uncertainties + ['Dosya kayıtları, karşı iddialar ve sonraki gelişmeler hukuk profesyoneli tarafından doğrulanmalıdır.']))[:20]
    if analysis:
        fingerprint['analysis'] = {key: getattr(analysis, key) for key in ['id', 'summary', 'possible_scenarios', 'strong_points', 'weak_points', 'missing_information', 'opposing_arguments', 'questions', 'recommended_actions', 'ai_disclaimer', 'requires_verification']}
    truncated = len(events) > LIMIT or document_count > LIMIT or bool(analysis and len(analysis.possible_scenarios or []) > 6)
    fingerprint['truncated'] = truncated
    version = hashlib.sha256(json.dumps(fingerprint, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
    common_sources = [s.id for s in sources if s.kind in {'case', 'event', 'document'}][:16]
    nodes = [TreeNode(id='root', parent_id=None, kind='context', label=text(case.case_name), description='Dosyada kaydedilen olay, iddia ve belge bağlamı.', reasoning='Bu kök dosyadaki kayıtları özetler; kayıtların doğruluğu veya hukuki sonucu bu görünümle doğrulanmış sayılmaz.', source_ids=common_sources, uncertainties=uncertainties)]
    if has_analysis:
        for i, scenario in enumerate(scenarios):
            sid = f'scenario-{i}'
            nodes.append(TreeNode(id=sid, parent_id='root', kind='scenario', label=scenario, description='Kayıtlı analizdeki alternatif senaryo; sıralama olasılık derecesi değildir.', reasoning='Bu metin dosyanın son tamamlanmış analizinden aynen alınmıştır. Analiz listelerinin aynı sırada bulunması nedensellik veya olasılık kanıtı sayılmaz.', source_ids=['analysis:' + analysis.id], uncertainties=uncertainties))
            for suffix, label, description in [('confirm', 'Koşullar doğrulanırsa', 'Bu senaryo açısından hazırlık ve dosya stratejisi yeniden değerlendirilebilir.'), ('change', 'Yeni veya çelişkili bulgu çıkarsa', 'Senaryonun dayanağı ve geçerliliği yeniden incelenmelidir.')]:
                nodes.append(TreeNode(id=sid + '-' + suffix, parent_id=sid, kind='outcome', label=label, description=description, reasoning='Bu bir koşullu inceleme yoludur; mahkeme kararının veya gerçekleşme sıklığının tahmini değildir.', source_ids=['analysis:' + analysis.id], uncertainties=uncertainties))
    else:
        paths = [
            ('confirm', 'Dayanaklar doğrulanırsa', 'Belge asılları ve olay kronolojisi incelenir.', 'İddiaların dayanakları yeniden değerlendirilir.'),
            ('complete', 'Eksik bilgiler tamamlanırsa', 'Eksik kayıtlar ve açık sorular dosyaya eklenir.', 'Hazırlık planı yeni bilgilerle güncellenebilir.'),
            ('contradict', 'Karşı veya çelişkili bulgu çıkarsa', 'Karşı iddia ile dosyadaki kayıtlar birlikte incelenir.', 'Alternatif argüman ve izlenecek adımlar gözden geçirilir.'),
        ]
        for sid, label, description, outcome in paths:
            nodes.append(TreeNode(id=sid, parent_id='root', kind='development', label=label, description=description, reasoning='Dosyaya ait hesaplanmış bir tahmin yoktur. Bu dal, mevcut kayıtların incelenmesi için genel ve koşullu bir hazırlık yoludur.', source_ids=common_sources, uncertainties=uncertainties))
            nodes.append(TreeNode(id=sid + '-outcome', parent_id=sid, kind='outcome', label=outcome, description='Olası hazırlık sonucu; davanın kabulü, reddi veya kazanma oranı olarak yorumlanamaz.', reasoning='Sonraki adım, dalda belirtilen koşulun gerçek dosyada doğrulanmasına bağlıdır.', source_ids=common_sources, uncertainties=uncertainties))
    return ScenarioTree(case_id=case.id, title=text(case.case_name), case_closed=case.status == CaseStatus.KAPALI,
        context_version=version, generated_at=datetime.now(timezone.utc), source_mode='stored_analysis' if has_analysis else 'conditional_preparation',
        analysis_id=analysis.id if has_analysis else None, analysis_created_at=str(analysis.created_at) if has_analysis else None,
        is_example=bool(has_analysis and simulation.provider in {'mock', 'demo-template'}), nodes=nodes, sources=sources, current_facts=facts[:80], uncertainties=uncertainties,
        truncated=truncated, limits_note='En çok son 60 gelişme, son 60 belge ve 6 kayıtlı senaryo gösterilir. Belgeler incelenmiş veya doğrulanmış sayılmaz.',
        disclaimer='Sayısal olasılık hesaplanmadı. Analiz skoru ve kanun atıf/bozulma oranları bu ağaca olasılık olarak aktarılmaz. Dallar karar desteğidir; hukuki sonuç veya başarı garantisi değildir.')
