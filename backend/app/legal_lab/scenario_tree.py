"""Read-only, tenant-scoped scenario tree. No provider calls or calibrated legal probabilities.

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
    kind: Literal['case', 'event', 'document', 'analysis', 'assumption']
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
    probability: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    assessment_label: Literal['Hesaplanmadı', 'Demo tahmini'] = 'Hesaplanmadı'
    probability_group_id: str | None = None
    support_weight: int | None = Field(default=None, ge=0, le=100)


class DemoAssumption(BaseModel):
    id: Literal['document', 'payment']
    label: str
    value: Literal['unreviewed', 'unknown', 'supports', 'contradicts', 'missing']
    value_label: str
    contributions: dict[str, int]
    explanation: str


class DemoWeight(BaseModel):
    node_id: str
    base_points: Literal[1] = 1
    score: int | None = Field(default=None, ge=1)
    percentage_tenths: int | None = Field(default=None, ge=0, le=1000)


class DemoGroup(BaseModel):
    id: Literal['demo:evidence-review'] = 'demo:evidence-review'
    question: str
    definition: str
    exclusive: Literal[True] = True
    exhaustive: Literal[True] = True
    calculated: bool
    weights: list[DemoWeight] = Field(min_length=3, max_length=3)
    total_points: int | None = Field(default=None, ge=3)


class DemoModel(BaseModel):
    fixture_id: Literal['invoice-evidence-v1'] = 'invoice-evidence-v1'
    method_version: Literal['demo-weights-v1'] = 'demo-weights-v1'
    method: str
    assumptions: list[DemoAssumption] = Field(min_length=2, max_length=2)
    groups: list[DemoGroup] = Field(min_length=1, max_length=1)
    missing_reason: str | None = None


SupportAssumption = Literal['neutral', 'supports', 'contradicts']


class SupportInput(BaseModel):
    node_id: str
    value: SupportAssumption
    linked_records: int = Field(ge=0, le=64)
    source_ids: list[str]
    delta: int = Field(ge=-20, le=20)
    explanation: str


class SupportModel(BaseModel):
    method_version: Literal['case-support-v1'] = 'case-support-v1'
    method: str
    assumptions: list[SupportInput] = Field(max_length=6)


class ScenarioTree(BaseModel):
    case_id: str
    title: str
    case_closed: bool
    context_version: str = Field(pattern=r'^[0-9a-f]{64}$')
    generated_at: datetime
    source_mode: Literal['stored_analysis', 'conditional_preparation', 'synthetic_demo', 'dossier_history']
    analysis_id: str | None = None
    analysis_created_at: str | None = None
    is_example: bool = False
    demo: DemoModel | None = None
    support_model: SupportModel | None = None
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
        if self.source_mode != 'synthetic_demo':
            if self.demo is not None or any(n.probability is not None or n.probability_group_id is not None for n in self.nodes):
                raise ValueError('Real case trees cannot contain normalized probabilities')
            if self.support_model:
                branches = {n.id: n for n in self.nodes if n.kind in {'scenario', 'development'}}
                inputs = self.support_model.assumptions
                if len(inputs) != len(branches) or {a.node_id for a in inputs} != set(branches):
                    raise ValueError('Support inputs must match branches')
                eligible = {s.id for s in self.sources if s.kind in {'event', 'document', 'analysis'}}
                for a in inputs:
                    n = branches[a.node_id]
                    refs = sorted(set(n.source_ids) & eligible)
                    delta = (0 if not refs else (10 + min(10, 2 * len(refs)))) * {'neutral': 0, 'supports': 1, 'contradicts': -1}[a.value]
                    if a.source_ids != refs or a.linked_records != len(refs) or a.delta != delta or n.support_weight != 50 + delta or n.assessment_label != 'Demo tahmini':
                        raise ValueError('Support arithmetic mismatch')
                if any(n.support_weight is not None for n in self.nodes if n.id not in branches):
                    raise ValueError('Only scenario branches have support weights')
            elif any(n.support_weight is not None or n.assessment_label != 'Hesaplanmadı' for n in self.nodes):
                raise ValueError('Support model is required')
            return self
        if self.support_model or any(n.support_weight is not None for n in self.nodes):
            raise ValueError('Synthetic partition cannot contain independent support weights')
        if self.case_id != 'demo:invoice-evidence-v1' or not self.is_example or not self.demo or self.analysis_id is not None or any(not s.id.startswith('demo:') for s in self.sources):
            raise ValueError('Demo requires the isolated synthetic fixture')
        assumptions = {a.id: a for a in self.demo.assumptions}
        if set(assumptions) != {'document', 'payment'} or assumptions['document'].value == 'unknown' or assumptions['payment'].value == 'unreviewed':
            raise ValueError('Invalid demo assumptions')
        for key, points in [('document', 2), ('payment', 1)]:
            a = assumptions[key]
            target = 'demo:' + (a.value if a.value in {'supports', 'contradicts'} else 'indeterminate')
            if a.contributions != ({} if a.value == 'missing' else {target: points}):
                raise ValueError('Wrong demo rule contribution')
        group = self.demo.groups[0]
        members = {w.node_id for w in group.weights}
        expected = {'demo:supports', 'demo:contradicts', 'demo:indeterminate'}
        if members != expected or {n.id for n in self.nodes if n.parent_id == 'root'} != expected:
            raise ValueError('Demo partition must contain exactly the three defined alternatives')
        if any(not set(a.contributions).issubset(expected) or any(v < 0 for v in a.contributions.values()) for a in assumptions.values()):
            raise ValueError('Invalid demo contributions')
        neutral = any(a.value == 'missing' for a in assumptions.values())
        if not group.calculated or bool(self.demo.missing_reason) != neutral:
            raise ValueError('Missing source requires visible equal starting basis')
        for n in self.nodes:
            if n.id not in members:
                if n.probability is not None or n.assessment_label != 'Hesaplanmadı' or n.probability_group_id is not None:
                    raise ValueError('Only partition members may have demo weights')
                continue
            w = next(w for w in group.weights if w.node_id == n.id)
            if n.probability_group_id != group.id:
                raise ValueError('Wrong demo group')
            if group.calculated:
                if w.score != (1 if neutral else 1 + sum(a.contributions.get(n.id, 0) for a in assumptions.values())) or w.percentage_tenths is None or n.probability is None or abs(n.probability - w.percentage_tenths / 1000) > 1e-12 or n.assessment_label != 'Demo tahmini':
                    raise ValueError('Demo node arithmetic mismatch')
            elif w.score is not None or w.percentage_tenths is not None or n.probability is not None or n.assessment_label != 'Hesaplanmadı':
                raise ValueError('Insufficient demo data must remain uncomputed')
        if group.calculated:
            scores = [w.score for w in group.weights]
            total = sum(scores)
            units = [score * 1000 // total for score in scores]
            order = sorted(range(3), key=lambda i: (-(scores[i] * 1000 % total), i))
            for i in order[:1000-sum(units)]:
                units[i] += 1
            if [w.node_id for w in group.weights] != ['demo:supports', 'demo:contradicts', 'demo:indeterminate'] or [w.percentage_tenths for w in group.weights] != units:
                raise ValueError('Wrong largest remainder rounding')
            if group.total_points != sum(w.score for w in group.weights) or sum(w.percentage_tenths for w in group.weights) != 1000:
                raise ValueError('Demo partition total mismatch')
        elif group.total_points is not None or not self.demo.missing_reason:
            raise ValueError('Missing-data reason required')
        return self


def build_tree(db: Session, case: Case, firm_id: str, assumptions: dict[str, SupportAssumption] | None = None) -> ScenarioTree:
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
    from app.db.dossier_pack import case_key, document_key
    from app.db.dossier_documents import entries
    from app.db.dossier_stories import STORIES
    story = next((s for s in STORIES if case.case_number == "ÖRNEK-" + s.code and case.id == case_key(firm_id, s)), None)
    if story and not has_analysis:
        from app.db.dossier_exhibits import EXHIBITS
        exhibit_titles = {title for title, _, _ in EXHIBITS[story.code]}
        available = {s.id for s in sources if s.kind == 'document'}
        records = entries(story)
        def references(matches):
            return [ref for e in records if matches(e.title)
                    and (ref := "document:" + document_key(case.id, e.key)) in available]
        groups = [
            ("evidence", "Olay ve dayanak kayıtlar", story.facts, story.finding,
             references(lambda title: title in exhibit_titles or any(t in title for t in ("Delil eki", "raporu", "Müzekkere cevabı", "Keşif", "Tanık dinleme")))),
            ("dispute", "Tartışılan husus", story.response, story.challenge,
             references(lambda title: any(t in title.lower() for t in ("itiraz", "beyan", "savunma", "dilekçesi", "tartışıldığı")))),
            ("recorded", "Gerçekleşen sonuç", story.judgment, story.end,
             references(lambda title: any(t in title.lower() for t in ("karar", "kapanış", "kyok")) and title != "Ara karar evrakı")),
        ]
        for key, label, description, reasoning, refs in groups:
            nodes.append(TreeNode(id=key, parent_id="root", kind="outcome" if key == "recorded" else "development",
                                  label=label, description=description, reasoning=reasoning, source_ids=refs,
                                  uncertainties=[] if refs else ["İlgili örnek evrak bu dosyada bulunamadı."]))
        nodes.append(TreeNode(id="alternative", parent_id="dispute", kind="scenario", label="Olası alternatif",
                              description="Karşı açıklama doğrulansaydı aynı kayıtlar yeniden değerlendirilirdi.",
                              reasoning=story.response, source_ids=groups[1][4], uncertainties=["Bu dal kurgusal dosyada gerçekleşmedi."]))
        return ScenarioTree(case_id=case.id, title=case.case_name, case_closed=case.status == CaseStatus.KAPALI,
                            context_version=version, generated_at=datetime.now(timezone.utc), source_mode="dossier_history",
                            analysis_id=None, analysis_created_at=None, is_example=True, nodes=nodes, sources=sources,
                            current_facts=facts[:80], uncertainties=uncertainties, truncated=truncated,
                            limits_note="Evrak bağlantıları seçili dosyaya aittir.",
                            disclaimer="Bu geçmiş, kurgusal dosyadaki belgeleri izler. Olasılık hesaplanmadı.")
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
    tree = ScenarioTree(case_id=case.id, title=text(case.case_name), case_closed=case.status == CaseStatus.KAPALI,
        context_version=version, generated_at=datetime.now(timezone.utc), source_mode='stored_analysis' if has_analysis else 'conditional_preparation',
        analysis_id=analysis.id if has_analysis else None, analysis_created_at=str(analysis.created_at) if has_analysis else None,
        is_example=bool(has_analysis and simulation.provider in {'mock', 'demo-template'}), nodes=nodes, sources=sources, current_facts=facts[:80], uncertainties=uncertainties,
        truncated=truncated, limits_note='En çok son 60 gelişme, son 60 belge ve 6 kayıtlı senaryo gösterilir. Belgeler incelenmiş veya doğrulanmış sayılmaz.',
        disclaimer='Demo tahmini: bağımsız 0–100 destek ağırlıklarıdır, toplamlanmaz. Kayıt sayısı yalnız gösterim kuralının duyarlılığıdır; kanıt gücü, doğruluk veya dava kazanma olasılığı değildir. Analiz skoru ve atıf oranları kullanılmaz.')
    return apply_case_support(tree, assumptions or {})


SUPPORT_METHOD = 'Her dal bağımsız 50/100 nötr başlangıç alır. Yalnız dalın doğrudan bağlandığı farklı gelişme, belge ve analiz kayıtları sayılır. Kayıt yoksa seçimden bağımsız 50 kalır. Kayıt varsa destekleyici varsayım +[10 + min(10, 2 × kayıt sayısı)], çelişkili varsayım aynı miktarda eksi, nötr varsayım 0 katkı verir. Katsayılar gösterim içindir; kayıtlar doğrulanmış veya bağımsız kanıt sayılmaz. Örtüşebilen dallar toplam %100 oluşturmaz.'


def apply_case_support(tree: ScenarioTree, assumptions: dict[str, SupportAssumption]) -> ScenarioTree:
    branches = [n for n in tree.nodes if n.kind in {'scenario', 'development'}]
    if not set(assumptions).issubset({n.id for n in branches}) or any(v not in {'neutral', 'supports', 'contradicts'} for v in assumptions.values()):
        raise ValueError('Invalid branch assumptions')
    eligible = {s.id for s in tree.sources if s.kind in {'event', 'document', 'analysis'}}
    inputs = []
    for n in branches:
        value = assumptions.get(n.id, 'neutral')
        refs = sorted(set(n.source_ids) & eligible)
        delta = (0 if not refs else 10 + min(10, 2 * len(refs))) * {'neutral': 0, 'supports': 1, 'contradicts': -1}[value]
        explanation = f'50 nötr başlangıç; {len(refs)} doğrudan bağlı kayıt; varsayım: ' + {'neutral':'nötr', 'supports':'destekleyici', 'contradicts':'çelişkili'}[value] + f'; katkı {delta:+d}; sonuç {50+delta}/100. '
        explanation += 'Kayıt yok: varsayım katkısı uygulanmadı, nötr başlangıç korundu.' if not refs else 'Kayıt sayısı doğruluk, bağımsızlık veya kanıt gücü ölçmez.'
        inputs.append(SupportInput(node_id=n.id, value=value, linked_records=len(refs), source_ids=refs, delta=delta, explanation=explanation))
        n.support_weight = 50 + delta
        n.assessment_label = 'Demo tahmini'
        n.reasoning += ' ' + explanation
    data = tree.model_dump()
    data['support_model'] = SupportModel(method=SUPPORT_METHOD, assumptions=inputs)
    data['context_version'] = hashlib.sha256(json.dumps({'content':tree.context_version, 'method':'case-support-v1', 'assumptions':{a.node_id:a.value for a in inputs}},sort_keys=True).encode()).hexdigest()
    return ScenarioTree.model_validate(data)
