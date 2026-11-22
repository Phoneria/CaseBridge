"""Code-owned synthetic fixture; never takes a real case, firm, document or model output."""
import hashlib
import json
from datetime import datetime, timezone
from typing import Literal

from app.legal_lab.scenario_tree import DemoAssumption, DemoGroup, DemoModel, DemoWeight, ScenarioTree, TreeNode, TreeSource

DocumentAssumption = Literal['unreviewed', 'supports', 'contradicts', 'missing']
PaymentAssumption = Literal['unknown', 'supports', 'contradicts', 'missing']
MEMBERS = ['demo:supports', 'demo:contradicts', 'demo:indeterminate']
LABELS = ['Destekleyici bulgular baskın', 'Çelişkili bulgular baskın', 'Yeterli ayrım yapılamadı']
VALUES = {'unreviewed':'Kayıt var, henüz incelenmedi', 'unknown':'Kayıt var, eşleşme belirsiz', 'supports':'Destekleyici olduğu varsayılıyor', 'contradicts':'Çelişkili olduğu varsayılıyor', 'missing':'Gerekli kayıt yok'}
METHOD = 'Örnek kural v1: üç alternatifin her biri 1 taban puan alır. Belge varsayımı ilgili gruba 2, ödeme eşleşmesi varsayımı 1 puan ekler. Puan / toplam puan, yalnız bu üç alternatif arasında paylaştırılır. Yüzde onda birleri en büyük kalan yöntemiyle 100,0’a tamamlanır; eşit kalanlarda gösterim sırası kullanılır. Katsayılar gösterim için seçilmiştir; veriyle öğrenilmiş veya kalibre edilmiş değildir.'


def percentage_tenths(scores: list[int]) -> list[int]:
    total = sum(scores)
    units = [s * 1000 // total for s in scores]
    order = sorted(range(len(scores)), key=lambda i: (-(scores[i] * 1000 % total), i))
    for i in order[:1000 - sum(units)]:
        units[i] += 1
    return units


def build_demo(document: DocumentAssumption = 'unreviewed', payment: PaymentAssumption = 'unknown') -> ScenarioTree:
    if document not in {'unreviewed', 'supports', 'contradicts', 'missing'} or payment not in {'unknown', 'supports', 'contradicts', 'missing'}:
        raise ValueError('Invalid synthetic assumption')
    assumptions = []
    for key, value, label, points in [('document', document, 'Dayanak belgenin doğrulama varsayımı', 2), ('payment', payment, 'Ödeme kaydının eşleşme varsayımı', 1)]:
        target = 'demo:' + (value if value in {'supports', 'contradicts'} else 'indeterminate')
        contributions = {} if value == 'missing' else {target: points}
        assumptions.append(DemoAssumption(id=key, label=label, value=value, value_label=VALUES[value], contributions=contributions,
            explanation=f'{VALUES[value]}. ' + ('Gerekli kayıt eksik: tüm grup eşit başlangıca döner; varsayım katkıları uygulanmaz.' if value == 'missing' else f'Yalnız örnek kuralda “{LABELS[MEMBERS.index(target)]}” grubuna {points} puan ekler; gerçek belge doğrulaması yapılmış sayılmaz.')))
    sufficient = document != 'missing' and payment != 'missing'
    scores = [1 + sum(a.contributions.get(id, 0) for a in assumptions) for id in MEMBERS] if sufficient else [1, 1, 1]
    units = percentage_tenths(scores)
    missing = None if sufficient else 'Gerekli kayıt eksik: tüm alternatifler eşit 1 taban puana döner, diğer varsayım katkıları uygulanmaz. Eşit başlangıç yuvarlamayla %33,4 / %33,3 / %33,3 görünür.'
    group = DemoGroup(question='Bu kurgusal dayanak incelemesinin değerlendirmesi hangi gruba ayrılır?',
        definition='Bu örnek modelde destek puanı baskın, çelişki puanı baskın veya yeterli ayrım yapılamayan durumlar ayrı kategorilerdir. Aynı değerlendirme aynı anda iki kategoride olamaz; eşit/kararsız durumlar üçüncü kategoridedir. Bunlar mahkeme kararı veya gerçek dünya sonuçlarının frekansı değildir.',
        calculated=True, total_points=sum(scores),
        weights=[DemoWeight(node_id=id, score=scores[i], percentage_tenths=units[i]) for i,id in enumerate(MEMBERS)])
    demo = DemoModel(method=METHOD, assumptions=assumptions, groups=[group], missing_reason=missing)
    sources = [TreeSource(id='demo:case',kind='case',label='Kurgusal alacak dosyası',detail='ÖRNEK-POC-001. Fatura, teslim ve ödeme eşleştirmesi üzerine tamamen sentetik bir eğitim örneği; büro kaydı değildir.'),
        TreeSource(id='demo:document',kind='document',label='Sentetik fatura / teslim dayanağı',detail='Örnek metinde fatura ve teslim tarihi eşleştirilecek. Gerçek belge veya kişi içermez.'),
        TreeSource(id='demo:payment',kind='document',label='Sentetik ödeme kaydı',detail='Örnek ödeme açıklamasının hangi faturaya ait olduğu incelenecek. Gerçek banka veya hesap verisi yoktur.'),
        TreeSource(id='demo:method',kind='analysis',label='Demo tahmin kuralı v1',detail=METHOD)]
    for a in assumptions:
        sources.append(TreeSource(id='demo:assumption:'+a.id,kind='assumption',label=a.label,detail=a.explanation))
    uncertainty = ['Tüm kayıtlar ve varsayımlar kurgusaldır; gerçek belge doğrulaması yapılmadı.', 'Puanlar gözlenen sıklık, kazanma oranı veya kalibre edilmiş olasılık değildir.'] + ([missing] if missing else [])
    refs = [s.id for s in sources]
    nodes = [TreeNode(id='root',parent_id=None,kind='context',label='POC örnek — Alacak dayanakları',description='Yalnız bu sentetik örnek üzerinde varsayımların senaryo ağırlıklarına etkisini deneyin.',reasoning='Gerçek dosya okunmaz veya değiştirilmez. Kök ve izleme adımları için yüzde hesaplanmaz.',source_ids=refs,uncertainties=uncertainty)]
    actions = ['Belge aslı ve teslim kaydını karşılaştırın.', 'Çelişkili tarih ve ödeme açıklamasını inceleyin.', 'Eksik eşleştirme bilgilerini tamamlayın.']
    for i,id in enumerate(MEMBERS):
        contributions = ', '.join(f'{a.label}: +{a.contributions.get(id,0)}' for a in assumptions)
        reason = f'Taban 1, {contributions}. ' + (f'Toplam {scores[i]} / {sum(scores)} puan; yüzde onda birleri görünür toplamı 100,0 yapacak şekilde paylaştırılır.' if sufficient else missing)
        nodes.append(TreeNode(id=id,parent_id='root',kind='scenario',label=LABELS[i],description='Aynı kurgusal inceleme sorusunun alternatif değerlendirme kategorisi; dava kazanma tahmini değildir.',reasoning=reason,source_ids=refs,uncertainties=uncertainty,
            probability=units[i]/1000, assessment_label='Demo tahmini',probability_group_id=group.id))
        nodes.append(TreeNode(id=id+':action',parent_id=id,kind='outcome',label=actions[i],description='Koşullu inceleme adımı; bu adımın gerçekleşmesi için bir yüzde hesaplanmaz.',reasoning='Hazırlık adımı değerlendirme kategorisinin sonucuna göre ele alınır; hukuki sonuç garantisi değildir.',source_ids=refs,uncertainties=uncertainty))
    version=hashlib.sha256(json.dumps({'fixture':demo.fixture_id,'method':demo.method_version,'document':document,'payment':payment},sort_keys=True).encode()).hexdigest()
    return ScenarioTree(case_id='demo:invoice-evidence-v1',title='POC örnek — Alacak dayanakları',case_closed=False,context_version=version,generated_at=datetime.now(timezone.utc),source_mode='synthetic_demo',is_example=True,demo=demo,nodes=nodes,sources=sources,
        current_facts=['Sentetik fatura ve teslim kaydı bulunuyor; doğrulama sonucu varsayım kontrolünden seçilir.', 'Sentetik ödeme kaydının faturayla eşleşmesi ayrıca varsayılır.'],uncertainties=uncertainty,truncated=False,
        limits_note='Yalnız bir sentetik örnek ve tek bir değerlendirme sorusu. Aynı grubun üç alternatifi toplam %100’dür; diğer düğümler ve gerçek dosyalar bu toplama dahil değildir.',
        disclaimer='Demo tahmini: gösterim amaçlı, varsayıma bağlı senaryo ağırlıklarıdır. Gerçek dava kazanma olasılığı, gözlenmiş sıklık veya doğrulanmış kalibrasyon değildir. Gerçek dosyalarda ayrı, toplamlanmayan demo destek ağırlıkları kullanılır.')
