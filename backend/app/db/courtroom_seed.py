"""Idempotent fictional training scenarios for interactive courtroom mode."""
from sqlalchemy.orm import Session

from app.models.courtroom import CourtroomScenario, ScenarioDifficulty, ScenarioEvidence


SCENARIOS = [
    {
        "slug": "odenmeyen-borc",
        "title": "Ödenmeyen 300.000 TL Borç",
        "summary": "Arkadaşlar arasındaki para transferinin borç mu yoksa kafe yatırımı mı olduğunu tartışın.",
        "category": "Borçlar Hukuku",
        "plaintiff_name": "Zeynep Acar",
        "defendant_name": "Burak Demir",
        "difficulty": ScenarioDifficulty.BEGINNER,
        "learning_objectives": [
            "İddia ile savunmayı ayırmak",
            "Birden fazla delili birlikte değerlendirmek",
            "Tanığın doğrudan bilgisini sorgulamak",
        ],
        "public_facts": [
            "Zeynep Acar, 5 Şubat 2025'te Burak Demir'e 300.000 TL gönderdi.",
            "Taraflar daha önce birlikte kafe açma fikrini konuştu.",
            "Para geri ödenmedi ve Zeynep noter ihtarı gönderdi.",
            "Burak parayı aldığını inkâr etmiyor; paranın niteliği tartışmalı.",
        ],
        "disputed_issues": [
            "Transfer geri ödenmek üzere verilen borç muydu?",
            "Yoksa riski taraflarca paylaşılan bir yatırım katkısı mıydı?",
            "Mesajlardaki 'borç' kelimesi hukuki kabul niteliğinde mi?",
        ],
        "plaintiff_private_brief": {
            "objective": "300.000 TL'nin geri ödenmek üzere verildiğini göstermek.",
            "known_facts": [
                "Müvekkilin kafe ortaklığına girmeyi hiçbir zaman kabul etmediğini söylüyor.",
                "Borç talebi sırasında Selin isimli arkadaşın masada bulunduğu belirtiliyor.",
            ],
            "strategy_notes": ["Dekont, mesaj ve tanık beyanını tek bir tutarlı zaman çizgisinde birleştir."],
        },
        "defendant_private_brief": {
            "objective": "Paranın başarısız bir ortak girişim için risk sermayesi olduğunu göstermek.",
            "known_facts": [
                "Kafe için tarafların birlikte baktığı iki dükkân bulunuyor.",
                "Yazılı bir ortaklık oranı veya imzalı yatırım sözleşmesi yok.",
            ],
            "strategy_notes": ["Dekont açıklamasının tek taraflı yazıldığını ve iş planının bağlamını vurgula."],
        },
        "judge_instructions": {"focus": ["taraf iradesi", "yazılı kayıtların tutarlılığı", "tanığın bilgi kaynağı"]},
        "legal_context": [
            "Para transferinin hukuki niteliği, tarafların açıklamaları ve deliller birlikte değerlendirilerek belirlenir.",
            "Bu kurgusal eğitim notları gerçek dosya için doğrulama gerektirir.",
        ],
        "evidence": [
            ("BORC_DEKONT", "Banka dekontu", "Transfer açıklaması", "banka_kaydi", "300.000 TL — açıklama: '3 ay vadeli borç'", "plaintiff", "undisputed"),
            ("BORC_MESAJ", "WhatsApp mesajı", "Davalının sonraki mesajı", "mesaj", "'Borcumu unutmadım. Dükkânın işleri toparlanınca tamamını ödeyeceğim.'", "plaintiff", "admitted"),
            ("BORC_IHTAR", "Noter ihtarı", "Geri ödeme talebi", "resmi_belge", "300.000 TL'nin yedi gün içinde ödenmesi talep edilmiştir.", "plaintiff", "undisputed"),
            ("BORC_IS_PLANI", "Kafe iş planı", "Taslak ortak girişim sunumu", "is_plani", "Zeynep ve Burak'ın isimlerinin bulunduğu; pay oranı ve imza içermeyen taslak sunum.", "defendant", "undisputed"),
            ("BORC_DUKKAN_MESAJ", "Dükkân mesajları", "Tarafların mekân baktığını gösteren yazışmalar", "mesaj", "Taraflar iki kiralık dükkân ilanı hakkında görüşmüştür; finansman şartı yazmamaktadır.", "defendant", "admitted"),
        ],
    },
    {
        "slug": "kira-tahliye",
        "title": "Kira Ödenmemesi Nedeniyle Tahliye",
        "summary": "Kiraya verenin ödeme yapılmadığı iddiası ile kiracının farklı açıklamalı havale savunmasını tartışın.",
        "category": "Kira Hukuku",
        "plaintiff_name": "Selçuk Arı",
        "defendant_name": "Ece Kara",
        "difficulty": ScenarioDifficulty.BEGINNER,
        "learning_objectives": ["Ödeme iddiasını belgelemek", "Tarih ve tutarları karşılaştırmak", "Usul ile esası ayırmak"],
        "public_facts": [
            "Kiracı Ece Kara aylık 25.000 TL bedelle konutta oturuyor.",
            "Kiraya veren Mart ve Nisan 2026 kiralarının ödenmediğini iddia ediyor.",
            "Kiracı aynı dönemde kiraya verene toplam 50.000 TL gönderdiğini söylüyor.",
            "Transfer açıklamalarında 'emanet iadesi' yazıyor.",
        ],
        "disputed_issues": ["Havaleler kira borcunu mu karşıladı?", "İhtar içeriği ve ödeme hesabı doğru mu?"],
        "plaintiff_private_brief": {
            "objective": "İki aylık kira borcunun ödenmediğini ve tahliye koşullarının oluştuğunu savunmak.",
            "known_facts": ["Taraflar arasında daha önce ayrı bir emanet para ilişkisi vardı."],
            "strategy_notes": ["Ödemelerin açıklaması, tarihi ve önceki emanet ilişkisini birlikte göster."],
        },
        "defendant_private_brief": {
            "objective": "50.000 TL ödemenin kira borcuna mahsup edilmesi gerektiğini göstermek.",
            "known_facts": ["Kiracı, açıklamayı telefon bankacılığında yanlış seçtiğini söylüyor."],
            "strategy_notes": ["Tutarların iki aylık kirayla birebir eşleşmesini ve ödeme tarihlerini vurgula."],
        },
        "judge_instructions": {"focus": ["ödeme amacı", "tarafların önceki ilişkisi", "tutar ve tarih eşleşmesi"]},
        "legal_context": ["Ödemenin hangi borca ilişkin olduğu somut kayıtlarla değerlendirilir; gerçek dosyada usul şartları ayrıca doğrulanmalıdır."],
        "evidence": [
            ("KIRA_SOZLESME", "Kira sözleşmesi", "Aylık bedeli gösterir", "sozlesme", "Aylık kira: 25.000 TL; ödeme günü her ayın beşi.", "both", "undisputed"),
            ("KIRA_IHTAR", "Ödeme ihtarı", "Mart ve Nisan bedelleri isteniyor", "resmi_belge", "Toplam 50.000 TL kira borcunun ödenmesi istenmiştir.", "plaintiff", "undisputed"),
            ("KIRA_HESAP", "Kiraya veren hesap dökümü", "Kira açıklamalı ödeme görünmüyor", "banka_kaydi", "Mart-Nisan döneminde 'kira' açıklamalı transfer bulunmamaktadır.", "plaintiff", "undisputed"),
            ("KIRA_HAVALE", "Kiracı havale kayıtları", "İki adet 25.000 TL transfer", "banka_kaydi", "6 Mart ve 4 Nisan'da 25.000'er TL; açıklama 'emanet iadesi'.", "defendant", "undisputed"),
            ("KIRA_MESAJ", "Ödeme sonrası mesaj", "Kiracının bildirim mesajı", "mesaj", "'Bu ayın 25'ini de gönderdim, hesabını kontrol eder misin?'", "defendant", "admitted"),
        ],
    },
    {
        "slug": "ise-iade",
        "title": "Haksız Fesih ve İşe İade",
        "summary": "Performans gerekçeli feshin kayıtlarla desteklenip desteklenmediğini inceleyin.",
        "category": "İş Hukuku",
        "plaintiff_name": "Mehmet Demir",
        "defendant_name": "Kuzey Satış A.Ş.",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "learning_objectives": ["Fesih gerekçesini test etmek", "Kayıtlarla tanıkları karşılaştırmak", "Kronolojik çelişki bulmak"],
        "public_facts": [
            "Mehmet Demir üç yıldır satış uzmanı olarak çalışıyordu.",
            "İş sözleşmesi düşük performans gerekçesiyle feshedildi.",
            "Mehmet son yıl hedefin yüzde 82'sine ulaştığını, ekip ortalamasının yüzde 78 olduğunu söylüyor.",
            "İşveren iki performans uyarısı verildiğini savunuyor.",
        ],
        "disputed_issues": ["Fesih gerekçesi somut ve tutarlı mı?", "İşçiye gelişim ve savunma fırsatı verildi mi?"],
        "plaintiff_private_brief": {
            "objective": "Performans gerekçesinin tutarsız olduğunu ve feshin geçersizliğini savunmak.",
            "known_facts": ["Müvekkil uyarılardan birindeki imzanın kendisine ait olmadığını söylüyor."],
            "strategy_notes": ["Ekip ortalaması ile kişisel sonucu ve uyarı tarihlerindeki çelişkiyi öne çıkar."],
        },
        "defendant_private_brief": {
            "objective": "Sürekli performans sorunu bulunduğunu ve feshin son çare olduğunu göstermek.",
            "known_facts": ["Müşteri şikâyetlerinin bir kısmı resmi sisteme geç girilmiş."],
            "strategy_notes": ["Yalnız satış yüzdesine değil müşteri kaybı ve süreç ihlallerine de dayan."],
        },
        "judge_instructions": {"focus": ["fesih gerekçesinin açıklığı", "ölçüm yöntemi", "uyarı ve savunma süreci"]},
        "legal_context": ["Bu eğitim senaryosunda fesih gerekçesinin tutarlılığı değerlendirilir; süreler ve dava şartları gerçek dosyada doğrulanmalıdır."],
        "evidence": [
            ("IS_FESIH", "Fesih bildirimi", "Düşük performans gerekçesi", "resmi_belge", "Genel olarak 'hedeflerin karşılanmaması' belirtilmiş; müşteri şikâyeti ayrıntısı yok.", "both", "undisputed"),
            ("IS_RAPOR", "Satış performans raporu", "Bireysel ve ekip sonuçları", "kurum_kaydi", "Mehmet %82; ekip ortalaması %78; şirket hedefi %90.", "plaintiff", "undisputed"),
            ("IS_EPOSTA", "Yönetici e-postası", "Olumlu dönem değerlendirmesi", "eposta", "Fesihten iki ay önce: 'Son çeyrekte belirgin toparlanma var.'", "plaintiff", "admitted"),
            ("IS_UYARILAR", "Performans uyarıları", "İki uyarı formu", "kurum_kaydi", "Biri imzalı, diğeri teslim kaydı olmadan dosyaya eklenmiş.", "defendant", "disputed"),
            ("IS_SIKAYET", "Müşteri şikâyet listesi", "Altı müşteri kaydı", "kurum_kaydi", "Altı kaydın dördü fesih tarihinden sonra sisteme girilmiş.", "defendant", "disputed"),
        ],
    },
    {
        "slug": "ticari-fatura",
        "title": "Ödenmeyen Ticari Fatura",
        "summary": "Teslim edilen ürünlerin ayıplı olduğu savunmasına karşı fatura ve teslim kayıtlarını değerlendirin.",
        "category": "Ticaret Hukuku",
        "plaintiff_name": "Yılmaz Tekstil Ltd. Şti.",
        "defendant_name": "Deniz Otel",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "learning_objectives": ["Teslim ile ayıp iddiasını ayırmak", "Ticari kayıtları eşleştirmek", "Bildirim zamanlamasını sorgulamak"],
        "public_facts": [
            "Yılmaz Tekstil, Deniz Otel'e 200 nevresim takımı teslim etti.",
            "560.000 TL tutarlı fatura ödenmedi.",
            "Alıcı ürünlerin renk verdiğini ve kullanılamaz olduğunu savunuyor.",
            "Satıcı, teslim sırasında itiraz bulunmadığını belirtiyor.",
        ],
        "disputed_issues": ["Ürünler ayıplı mıydı?", "Ayıp zamanında ve somut biçimde bildirildi mi?", "Fatura bedeli tamamen ödenmeli mi?"],
        "plaintiff_private_brief": {
            "objective": "Eksiksiz teslimi ve geç/soyut ayıp savunmasını göstererek bedelin tahsilini istemek.",
            "known_facts": ["Aynı üretim partisinden başka müşteriler şikâyet etmedi."],
            "strategy_notes": ["Teslim tutanağı ile şikâyet tarihini yan yana getir."],
        },
        "defendant_private_brief": {
            "objective": "Ürünlerin kullanım sonrası ortaya çıkan gizli ayıplı olduğunu göstermek.",
            "known_facts": ["İlk yıkama otelin kendi çamaşırhanesinde yapıldı; makine ayar kaydı eksik."],
            "strategy_notes": ["Ayıbın teslimde fark edilemeyeceğini ve fotoğrafları vurgula."],
        },
        "judge_instructions": {"focus": ["teslim", "ayıbın niteliği", "bildirim", "nedensellik"]},
        "legal_context": ["Teslim, ayıp ve bildirim iddiaları kendi delilleriyle ele alınmalıdır; kesin yasal süreler doğrulama gerektirir."],
        "evidence": [
            ("TIC_FATURA", "Fatura", "560.000 TL satış faturası", "fatura", "200 nevresim takımı, toplam 560.000 TL.", "plaintiff", "undisputed"),
            ("TIC_IRSALIYE", "İmzalı irsaliye", "200 ürünün teslimi", "teslim_belgesi", "Teslim alan imzası var; görünür hasar notu yok.", "plaintiff", "undisputed"),
            ("TIC_PARTI", "Üretim parti raporu", "Kalite kontrol sonucu", "teknik_kayit", "Numune kalite kontrolü uygun; başka müşteri şikâyeti yok.", "plaintiff", "disputed"),
            ("TIC_FOTO", "Yıkama sonrası fotoğraflar", "Renk değişimini gösterdiği iddia ediliyor", "fotograf", "Bazı ürünlerde pembeleşme görülüyor; çekim tarihi doğrulanmış.", "defendant", "admitted"),
            ("TIC_EPOSTA", "Ayıp ihbarı e-postası", "Teslimden 18 gün sonra gönderilmiş", "eposta", "'İlk yıkamada renkler karıştı, ürünleri kullanamıyoruz.'", "defendant", "admitted"),
        ],
    },
    {
        "slug": "insaat-gecikme",
        "title": "İnşaat Sözleşmesinde Gecikme",
        "summary": "Proje teslimindeki 90 günlük gecikmenin yükleniciye mi yoksa iş sahibinin değişikliklerine mi ait olduğunu tartışın.",
        "category": "Sözleşme Hukuku",
        "plaintiff_name": "Pera Ofis A.Ş.",
        "defendant_name": "Usta Yapı Ltd. Şti.",
        "difficulty": ScenarioDifficulty.ADVANCED,
        "learning_objectives": ["Nedensellik zinciri kurmak", "Tarafların gecikmeye katkısını ayırmak", "Teknik kaydı argümana dönüştürmek"],
        "public_facts": [
            "Ofis renovasyonu sözleşmedeki tarihten 90 gün sonra teslim edildi.",
            "İş sahibi gecikme bedeli talep ediyor.",
            "Yüklenici, sonradan istenen proje değişikliklerinin takvimi uzattığını savunuyor.",
            "Taraflar üç değişiklik talimatının verildiğini kabul ediyor ancak etkisinde anlaşamıyor.",
        ],
        "disputed_issues": ["Her değişiklik kaç gün gecikmeye yol açtı?", "Yüklenicinin kendi organizasyon sorunu var mıydı?", "Gecikme bedelinin tamamı istenebilir mi?"],
        "plaintiff_private_brief": {
            "objective": "Gecikmenin esas olarak yüklenicinin personel ve tedarik planlamasından kaynaklandığını göstermek.",
            "known_facts": ["Şantiye şefi iki hafta boyunca ekip sayısının yetersiz olduğunu mesajla bildirdi."],
            "strategy_notes": ["Değişiklik günleri dışındaki boş çalışma dönemlerine odaklan."],
        },
        "defendant_private_brief": {
            "objective": "İş sahibinin değişikliklerinin kritik iş programını bozduğunu ve süre uzatımı gerektirdiğini göstermek.",
            "known_facts": ["Bir değişiklik özel üretim malzeme gerektirdi ve tedarikçi 35 gün termin verdi."],
            "strategy_notes": ["Her değişikliği takvimdeki somut etkisiyle eşleştir; genel mazeret sunma."],
        },
        "judge_instructions": {"focus": ["kritik yol", "değişiklik tarihleri", "eş zamanlı gecikme", "zarar hesabı"]},
        "legal_context": ["Gecikme ile taraf davranışları arasındaki nedensellik teknik kayıtlarla kurulmalıdır; hukuki sonuçlar doğrulama gerektirir."],
        "evidence": [
            ("INS_SOZLESME", "İnşaat sözleşmesi", "Teslim tarihi ve gecikme hükmü", "sozlesme", "Planlanan teslim 1 Mart; gecikme için günlük bedel öngörülmüş.", "both", "undisputed"),
            ("INS_GUNLUK", "Şantiye günlükleri", "Ekip ve çalışma kayıtları", "teknik_kayit", "Bazı haftalarda ekip sayısı planın yarısında; üç değişiklik döneminde çalışma durdurulmuş.", "plaintiff", "undisputed"),
            ("INS_SEF_MESAJ", "Şantiye şefi mesajları", "Personel yetersizliği bildirimi", "mesaj", "'Bu ekiple programı yakalamamız zor; iki ekip daha gerekiyor.'", "plaintiff", "admitted"),
            ("INS_DEGISIKLIK", "Değişiklik talimatları", "Üç yazılı proje revizyonu", "proje_belgesi", "Talimatlar sırasıyla 7, 12 ve 35 günlük tahmini etki içeriyor.", "defendant", "undisputed"),
            ("INS_TEDARIK", "Tedarikçi termin yazısı", "Özel malzeme için 35 gün", "ticari_yazi", "Revize malzemenin üretim ve teslim süresi 35 gün olarak bildirilmiş.", "defendant", "admitted"),
        ],
    },
]


def seed_courtroom_scenarios(db: Session) -> int:
    """Create or update scenarios by slug and evidence by code."""
    for definition in SCENARIOS:
        evidence_rows = definition["evidence"]
        fields = {key: value for key, value in definition.items() if key != "evidence"}
        scenario = db.query(CourtroomScenario).filter(CourtroomScenario.slug == fields["slug"]).first()
        if scenario is None:
            scenario = CourtroomScenario(**fields)
            db.add(scenario)
            db.flush()
        else:
            for key, value in fields.items():
                setattr(scenario, key, value)

        existing = {row.code: row for row in scenario.evidence}
        for order, row in enumerate(evidence_rows, start=1):
            code, title, description, evidence_type, content, owner_role, authenticity_status = row
            evidence = existing.get(code)
            values = {
                "title": title,
                "description": description,
                "evidence_type": evidence_type,
                "content": content,
                "owner_role": owner_role,
                "initially_available": True,
                "authenticity_status": authenticity_status,
                "sort_order": order,
            }
            if evidence is None:
                db.add(ScenarioEvidence(scenario_id=scenario.id, code=code, **values))
            else:
                for key, value in values.items():
                    setattr(evidence, key, value)
    db.flush()
    return len(SCENARIOS)
