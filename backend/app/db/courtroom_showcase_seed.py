"""Completed, fictional hearings for the demo account; never modifies user sessions."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.courtroom import (
    CourtroomActor, CourtroomPhase, CourtroomRole, CourtroomScenario,
    CourtroomSession, CourtroomSessionStatus, CourtroomTurn, CourtroomTurnType,
    JudgeEvaluation,
)
from app.models.user import User


# Each pair is the plaintiff lawyer's statement and the defendant lawyer's
# substantive answer. The judge then narrows the issue at every phase.
SHOWCASE_DIALOGUES = {
    "odenmeyen-borc": [
        ("Sayın hâkim, 300.000 TL'nin üç ay vadeli borç olarak verildiğini ve geri ödenmediğini ileri sürüyoruz.", "Transferi kabul ediyoruz; ancak kafe girişimine sermaye katkısıydı, geri ödeme taahhüdü yoktu."),
        ("Dekont açıklamasındaki vade ile daha sonraki 'borcumu unutmadım' mesajı aynı yönde iki kayıt oluşturuyor.", "Dekont açıklamasını gönderen tek başına yazdı; mesajdaki söz kafe işleri düzelince yapılacak hesaplaşmaya ilişkindir."),
        ("Banka dekontunu sunuyoruz: 300.000 TL ve '3 ay vadeli borç' açıklaması açıkça görülüyor.", "İmzasız kafe iş planını sunuyoruz; iki tarafın isimleri ve birlikte bakılan dükkânlar yatırım bağlamını gösteriyor."),
        ("Mesajın tarihini ve tam konuşma dizisini doğrulamaya hazırız; tek bir cümleyi bağlamından koparmıyoruz.", "İş planındaki pay oranı belirlenmemiştir; buna rağmen tarafların ortak faaliyet hazırlığı tartışmasızdır."),
        ("İş planı taslağı geri ödeme vadeli dekontu ve davalının borç ifadesini ortadan kaldırmaz.", "'Borç' sözcüğü gündelik dilde kullanılmış olabilir; tanığın gerçekten hangi anlaşmaya şahit olduğu sorulmalıdır."),
        ("Dekont, mesaj ve ödeme yapılmaması birlikte değerlendirilerek alacağın kabulünü istiyoruz.", "Yatırım amacı ve tanığın dolaylı bilgisi nedeniyle borç niteliğinin kanıtlanmadığını savunuyoruz."),
    ],
    "kira-tahliye": [
        ("Mart ve Nisan kiraları kira açıklamasıyla ödenmediği için tahliye talebimizi sürdürüyoruz.", "Aynı iki ayda toplam 50.000 TL havale yaptık; tutar iki aylık kiraya eşittir."),
        ("Tarafların ayrıca bir emanet ilişkisi vardı; 'emanet iadesi' açıklaması bu ödemelerin başka borca ait olduğunu gösteriyor.", "Telefon bankacılığında yanlış açıklama seçildi; ödeme tarihleri ve tutarlar kira takvimiyle örtüşüyor."),
        ("Kira sözleşmesini, ihtarı ve kira açıklamalı ödeme bulunmayan hesap dökümünü sunuyoruz.", "6 Mart ve 4 Nisan tarihli 25.000'er TL havaleyi ve ödeme sonrası mesajımızı sunuyoruz."),
        ("Emanet ilişkisinin tutarını ve iade zamanını gösteren ayrı kayıtların incelenmesini talep ediyoruz.", "İhtar hesabının havaleleri neden dışladığını açıklamasını istiyoruz; aynı tutarın başka borca mahsup edildiği kanıtlanmalı."),
        ("Sadece tutarın eşit olması ödeme amacını değiştirmez; havale açıklaması önemlidir.", "Açıklama tek başına belirleyici olamaz; eşzamanlı mesaj ve tarihler birlikte değerlendirilmelidir."),
        ("Ödeme amacına ilişkin kayıtların tamamı incelenerek tahliye talebimizin kabulünü istiyoruz.", "Havalelerin kira borcuna sayılması ve tahliye talebinin reddini istiyoruz."),
    ],
    "ise-iade": [
        ("Performans gerekçeli fesih somut ve tutarlı değildir; işe iade talep ediyoruz.", "Şirket hedefi yüzde 90 iken davacı yüzde 82'de kalmış, ayrıca müşteri şikâyetleri oluşmuştur."),
        ("Ekip ortalaması yüzde 78'dir ve yönetici fesihten iki ay önce toparlanmayı yazılı olarak bildirmiştir.", "Satış yüzdesi tek ölçüt değildir; uyarılar ve müşteri kaybı birlikte ele alınmalıdır."),
        ("Performans raporu ile olumlu yönetici e-postasını sunuyoruz; fesih bildiriminde şikâyet ayrıntısı yok.", "İki uyarı formu ve şikâyet listesini sunuyoruz; belgelerin teslim ve kayıt tarihleri incelenebilir."),
        ("İkinci uyarının tebliği kanıtlanamıyor; şikâyetlerin dördü fesih sonrasında sisteme girilmiş.", "Geç veri girişi olayların sonra yaşandığı anlamına gelmez; asıl müşteri bildirim tarihlerini göstereceğiz."),
        ("Sonradan girilen kayıtlar ve olumlu ara değerlendirme karşısında fesih gerekçesi kendi içinde çelişiyor.", "Uyarı ve gelişim sürecinin tamamı incelenmeden tek e-postadan sonuç çıkarılmamalıdır."),
        ("Feshin geçersizliğine ve işe iade talebimizin kabulüne karar verilmesini istiyoruz.", "Ölçüm yöntemi ve uyarılar doğrulandığında feshin haklılığının kabulünü istiyoruz."),
    ],
    "ticari-fatura": [
        ("200 nevresim takımını teslim ettik; 560.000 TL fatura ödenmedi.", "Ürünler ilk yıkamada renk verdi ve otelde kullanılamaz hâle geldi."),
        ("İmzalı irsaliyede görünür ayıp kaydı yok; ayıp bildirimi teslimden 18 gün sonra yapıldı.", "Gizli ayıp teslim anında görülemezdi; ilk kullanım sonrası fotoğraflar bunu gösteriyor."),
        ("Fatura, imzalı irsaliye ve üretim parti kontrol raporunu sunuyoruz.", "Tarihi doğrulanmış fotoğrafları ve ayıp ihbarı e-postasını sunuyoruz."),
        ("Yıkama ayarlarının kayıtları ve ürün örneklerinin teknik incelemesi nedensellik için gereklidir.", "Parti raporu yalnız numuneye ilişkin; teslim edilen ürünlerin tümünü temsil ettiğini kanıtlamaz."),
        ("Fotoğraflar renk değişimini gösterse de sebebini göstermez; otelin yıkama koşulları belirsizdir.", "Teslimde sessiz kalınması ilk yıkamada ortaya çıkan ayıbı dışlamaz; teknik inceleme gerekir."),
        ("Teslim ve fatura borcu sabittir; kanıtlanmamış ayıp savunmasıyla tamamının reddi istenemez.", "Teknik bilirkişi incelemesi tamamlanmadan tam bedelin tahsiline karar verilmemesini istiyoruz."),
    ],
    "insaat-gecikme": [
        ("Ofis işi sözleşmedeki tarihten 90 gün sonra teslim edildi; gecikme bedeli talep ediyoruz.", "İş sahibinin üç proje değişikliği kritik iş programını uzattı."),
        ("Şantiye günlükleri değişiklik dışındaki haftalarda da ekip sayısının yetersiz olduğunu gösteriyor.", "Özellikle özel üretim malzeme 35 gün termin gerektirdi; etkiler toplam takvimde ayrıştırılmalı."),
        ("Sözleşme, günlükler ve şantiye şefinin ek ekip gerektiğine dair mesajını sunuyoruz.", "Üç yazılı değişiklik talimatını ve tedarikçi termin yazısını sunuyoruz."),
        ("7, 12 ve 35 günlük tahmini etkilerin aynı kritik yola mı düştüğünü bilirkişi hesaplamalı.", "Aynı dönemler üst üste binmiş olabilir; gecikme günlerini doğrudan toplamak da doğru olmaz."),
        ("İş sahibinin değişiklikleri açıklanamayan boş çalışma dönemlerini haklı göstermez.", "Yükleniciye atfedilen ekip eksikliğinin fiilî teslim tarihine etkisi ayrıca gösterilmelidir."),
        ("Taraf katkıları ayrıştırılıp kanıtlanan gecikme bedeline hükmedilmesini istiyoruz.", "Kritik yol analizi olmadan 90 günün tamamından sorumlu tutulmamıza itiraz ediyoruz."),
    ],
    "ticari-kira-uyarlama": [
        ("Ticari kira ilişkisinde ekonomik koşulların değiştiğini ileri sürüyor, bedelin incelenmesini istiyoruz.", "Soyut piyasa değişimi, bu taşınmaz için doğrudan yeni bir kira bedeli oluşturmaz."),
        ("İstanbul geneli piyasa eğilimi bir başlangıç göstergesidir; somut taşınmaz için ayrıca inceleme gerektiğini kabul ediyoruz.", "Açık adres, alan ve kira geçmişi olmadan karşılaştırılabilir emsal seçimi mümkün değildir."),
        ("Dosya özetini ve genel piyasa notunu sunuyoruz; bunları üç somut emsal yerine koymuyoruz.", "Eksik belge listesini sunuyoruz: imzalı sözleşme, m², adres, ödeme geçmişi ve kaynaklı emsaller yok."),
        ("Müvekkilden taşınmaz nitelikleri ve sözleşmeyi talep edip bilirkişiye karşılaştırma soruları yönelteceğiz.", "Belgeler gelmeden miktar belirlenmesine itiraz ediyoruz; ilanların tarih ve kullanım türü de doğrulanmalı."),
        ("Eksikler talebin hiç incelenmemesini değil, ispatın tamamlanmasını gerektirir.", "Genel endeksin kira rayici olarak sunulmaması ve karşılaştırılabilir emsallerin ayrı doğrulanması gerekir."),
        ("Önce delillerin tamamlanmasını, ardından somut taşınmaz bakımından değerlendirme yapılmasını istiyoruz.", "Doğrulanmamış emsal üzerinden bedel belirlenmemesini talep ediyoruz."),
    ],
}

SHOWCASE_OUTCOMES = {
    "odenmeyen-borc": ("plaintiff", "Dekontun vade açıklaması ile sonraki borç mesajı birlikte daha güçlü ve tutarlı bir borç anlatısı kuruyor."),
    "kira-tahliye": ("undetermined", "Havalelerin hangi borca mahsup edildiği, emanet ilişkisinin kayıtları görülmeden kesinleştirilemiyor."),
    "ise-iade": ("plaintiff", "Fesih bildiriminin genel ifadesi, olumlu ara değerlendirme ve uyarı tebliğindeki boşluk birlikte değerlendirildi."),
    "ticari-fatura": ("partial", "Teslim ve bedel kayıtlı; ayıbın sebebi ve kapsamı için teknik inceleme eksik olduğundan tam tahsil veya tam ret kesinleştirilemez."),
    "insaat-gecikme": ("partial", "Doksan günün taraflara dağılımı için kritik yol incelemesi gerekir; iki tarafta da gecikme etkisine dair kayıt var."),
    "ticari-kira-uyarlama": ("undetermined", "Sözleşme, taşınmaz nitelikleri ve doğrulanmış kira emsalleri olmadan somut bedel belirlenemez."),
}


def seed_courtroom_showcases(db: Session, admin: User) -> int:
    now = datetime.now(timezone.utc)
    created = 0
    for slug, dialogue in SHOWCASE_DIALOGUES.items():
        verdict, reasoning = SHOWCASE_OUTCOMES[slug]
        scenario = db.query(CourtroomScenario).filter_by(slug=slug, law_firm_id=None).first()
        if scenario is None:
            continue
        existing = db.query(CourtroomSession).filter_by(
            scenario_id=scenario.id, user_id=admin.id, prompt_version="showcase-v1",
        ).first()
        if existing:
            continue
        session = CourtroomSession(
            scenario_id=scenario.id, law_firm_id=admin.law_firm_id, user_id=admin.id,
            chosen_role=CourtroomRole.PLAINTIFF, opponent_role=CourtroomRole.DEFENDANT,
            status=CourtroomSessionStatus.COMPLETED, phase=CourtroomPhase.VERDICT,
            current_actor=CourtroomActor.SYSTEM, round_number=6, max_rounds=6,
            model="scripted-training-example", prompt_version="showcase-v1", completed_at=now,
        )
        db.add(session)
        db.flush()
        db.add(CourtroomTurn(
            session_id=session.id, sequence_number=1, actor=CourtroomActor.SYSTEM,
            legal_role="system", turn_type=CourtroomTurnType.INSTRUCTION,
            content="Tamamlanmış kurgusal eğitim duruşması. Bu konuşmalar gerçek mahkeme tutanağı değildir.",
            structured_data={"showcase": True},
        ))
        phases = [CourtroomPhase.OPENING, CourtroomPhase.MAIN_ARGUMENTS, CourtroomPhase.EVIDENCE,
                  CourtroomPhase.EXAMINATION, CourtroomPhase.REBUTTAL, CourtroomPhase.CLOSING]
        for index, (user_text, opponent_text) in enumerate(dialogue):
            phase = phases[index]
            issue = scenario.disputed_issues[index % len(scenario.disputed_issues)]
            judge_text = (
                f"Tarafların bu aşamadaki beyanları kayda geçti. {issue} Sunulan belgelerin aslı, tarihi ve karşı tarafça kabul durumu ayrıca incelenecek."
                if index < 5 else f"Kurgusal eğitim sonucu: {reasoning} Bu gerçek dosyada verilmiş bir mahkeme kararı değildir."
            )
            for actor, role, turn_type, content in (
                (CourtroomActor.USER, "plaintiff_lawyer", CourtroomTurnType.CLOSING if index == 5 else CourtroomTurnType.ARGUMENT, user_text),
                (CourtroomActor.OPPONENT, "defendant_lawyer", CourtroomTurnType.REBUTTAL, opponent_text),
                (CourtroomActor.JUDGE, "judge", CourtroomTurnType.VERDICT if index == 5 else CourtroomTurnType.QUESTION, judge_text),
            ):
                db.add(CourtroomTurn(
                    session_id=session.id, sequence_number=2 + index * 3 + (0 if actor == CourtroomActor.USER else 1 if actor == CourtroomActor.OPPONENT else 2),
                    actor=actor, legal_role=role, turn_type=turn_type, content=content,
                    structured_data={"phase": phase.value, "showcase": True},
                ))
        db.add(JudgeEvaluation(
            session_id=session.id, verdict=verdict,
            summary=f"{scenario.title}: tarafların karşılıklı beyanları ve delil tartışması tamamlandı; bu prova gerçek davanın sonucunu belirlemez.",
            reasoning=f"{reasoning} Sunulan kayıtların doğruluğu ve eksik deliller gerçek bir dosyada ayrıca incelenmelidir.",
            evidence_assessment=[f"{item.title}: kurgusal senaryo delili; gerçek dosyadaki aslı doğrulanmalıdır." for item in scenario.evidence[:3]],
            unanswered_questions=scenario.disputed_issues[:2],
            user_strengths=["İddia ve delil bağlantısı kuruldu.", "Karşı tarafın savunmasına cevap verildi."],
            user_weaknesses=["Bazı belge ve kayıtların aslı doğrulanmadı."],
            learning_notes=["Bir sonraki provada ispat boşluklarını daha erken belirleyin."],
            relevance_score=19, evidence_score=18, rebuttal_score=18, courtroom_strategy_score=18,
            total_score=73, confidence="low", requires_verification=True,
            disclaimer="Kurgusal eğitim örneğidir; gerçek duruşma tutanağı, hukuki görüş veya karar tahmini değildir.",
        ))
        created += 1
    db.flush()
    return created
