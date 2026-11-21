"""Predetermined (mock) outputs used while no AI key is configured (LLM_PROVIDER=mock).

These are clearly labelled placeholders: they show the product flow end to end, they are not
an assessment of the user's case. Statute references resolve against the real graph data.
"""
from app.legal_lab.graph import law_ref

MOCK_NOTE = "Örnek içerik: AI anahtarı tanımlı değil. Sonuçlar önceden belirlenmiş yer tutuculardır, bu dosyaya özgü bir değerlendirme değildir."

STAGES = [
    {"id": "acilis", "name": "Dava ve cevap"},
    {"id": "on_inceleme", "name": "Ön inceleme"},
    {"id": "delil", "name": "Delil ve ispat"},
    {"id": "bilirkisi", "name": "Bilirkişi raporu"},
    {"id": "karar", "name": "Hüküm"},
]
CHARS = {
    "hakim": "Hâkim",
    "davaci": "Davacı vekili",
    "davali": "Davalı vekili",
    "bilirkisi": "Bilirkişi",
}

# ---------------------------------------------------------------- Karşı Taraf Analizi
_FINDINGS = [
    dict(id="m1", stage="delil", type="risk", severity=4, legitimacy="mesru", basis=["HMK m.190"],
         title="İspat yükü bizde olabilir",
         fact="Talebin dayandığı ana olgu için dosyada yazılı belge bulunup bulunmadığı netleştirilmeli.",
         rule="İspat yükü, kanunda aksi öngörülmedikçe iddia edilen olguyu ileri süren tarafa aittir.",
         inference="Karşı taraf olguyu inkâr ederse ispat bize kalır; belge eksikse talep reddedilebilir.",
         action="Talebi destekleyen belge ve tanık listesini duruşma öncesi tamamlayın."),
    dict(id="m2", stage="acilis", type="risk", severity=3, legitimacy="mesru", basis=["HMK m.119"],
         title="Talep sonucu net olmayabilir",
         fact="Dilekçedeki talep kalemlerinin ayrı ayrı ve açık yazıldığı kontrol edilmeli.",
         rule="Dava dilekçesinde talep sonucu açık ve belirli biçimde gösterilmelidir.",
         inference="Belirsiz kalem, karşı tarafın usul itirazına ve hâkimin eksiklik kararına yol açabilir.",
         action="Talep sonucunu kalem kalem yeniden yazıp gerekirse ıslah/ek dilekçe değerlendirin."),
    dict(id="m3", stage="bilirkisi", type="firsat", severity=4, legitimacy="mesru", basis=["HMK m.266"],
         title="Bilirkişi raporuna itiraz fırsatı",
         fact="Hesaba dayanan kalemlerde bilirkişi incelemesi istenmesi muhtemel.",
         rule="Teknik bilgi gerektiren konularda hâkim bilirkişiye başvurur; taraflar rapora itiraz edebilir.",
         inference="Rapor eksik veya varsayıma dayanıyorsa ek rapor / yeni bilirkişi talebi sonucu etkileyebilir.",
         action="Rapor geldiğinde süresi içinde somut gerekçeli itiraz dilekçesi hazırlayın."),
    dict(id="m4", stage="karar", type="risk", severity=3, legitimacy="mesru", basis=["3095 s. K. m.2"],
         title="Faiz türü ve başlangıcı tartışmalı olabilir",
         fact="Alacağın temerrüt tarihi ve talep edilen faiz türü dosyadan doğrulanmalı.",
         rule="Temerrüt faizi, temerrüt tarihinden itibaren kanuni oran veya sözleşmedeki oranla işler.",
         inference="Yanlış başlangıç tarihi veya oran, hesapta fark yaratır ve karşı tarafın itirazına konu olur.",
         action="İhtarname/temerrüt tarihini belgeleyin, faiz hesabını tek tabloda sabitleyin."),
    dict(id="m5", stage="cevap", type="risk", severity=3, legitimacy="mesru", basis=["TBK m.97"],
         title="Karşı taraf ödemezlik defi ileri sürebilir",
         fact="Karşılıklı edimlerden bizim tarafın yerine getirdiği kısım belgelenmeli.",
         rule="Karşılıklı sözleşmede edimini ifa etmeyen taraf, karşı tarafın ifasını isteyemez / ifadan kaçınabilir.",
         inference="Bizim edimimizdeki eksiklik karşı tarafa savunma imkânı verir.",
         action="Kendi edimlerimizin ifasını gösteren teslim/ödeme belgelerini hazırlayın."),
    dict(id="m6", stage="acilis", type="risk", severity=2, legitimacy="mesru", basis=["HMK m.114"],
         title="Dava şartları ilk itirazla gündeme gelebilir",
         fact="Görevli/yetkili mahkeme ve arabuluculuk şartı dosyada kontrol edilmeli.",
         rule="Dava şartları mahkemece kendiliğinden incelenir; eksiklik usulden reddi doğurabilir.",
         inference="Zorunlu başvuru yolu atlanmışsa dava usulden reddedilip zaman kaybı yaşanabilir.",
         action="Görev, yetki ve zorunlu arabuluculuk son tutanağını önceden doğrulayın."),
]


def counter_findings() -> list[dict]:
    out = []
    for f in _FINDINGS:
        refs = [law_ref(c) for c in f["basis"]]
        out.append({**f, "basis": refs, "support": "partial", "fact_ok": False})
    return sorted(out, key=lambda x: -x["severity"])


# ---------------------------------------------------------------- Duruşma simülasyonu
_SCRIPT = {
    0: [("davaci", "Sayın Hâkim, talebimiz dilekçedeki sözleşmeye dayanmaktadır; bedelin ödenmediğini ileri sürüyoruz."),
        ("davali", "Sayın Hâkim, talebi kabul etmiyoruz; edimin eksik ifa edildiğini savunuyoruz."),
        ("hakim", "Taraf beyanları alındı; usule ilişkin bir itiraz var mı, ön incelemeye geçilecektir.")],
    1: [("hakim", "Uyuşmazlık konuları: borcun varlığı ve edimin ifa edilip edilmediği. Taraflar delillerini bildirsin."),
        ("davaci", "Sözleşme, fatura ve yazışmaları delil olarak sunuyoruz."),
        ("davali", "Belgelerin içeriğine itiraz ediyoruz; ifa edildiğini gösteren kayıtlarımızı sunacağız.")],
    2: [("hakim", "İspat yükü iddia eden tarafta; delil listeleri duruşma tutanağına geçsin."),
        ("davaci", "Tanık listemizi ve belge asıllarını sunuyoruz."),
        ("davali", "Tanıkların dinlenmesine itirazımız yok, ancak hesap konusunda bilirkişi incelemesi talep ediyoruz.")],
    3: [("bilirkisi", "Raporda hesaplanan tutar, sunulan belgelere göre belirlenmiştir; eksik belge nedeniyle bir kalem tahmini kalmıştır."),
        ("davaci", "Rapora, eksik kalemin tamamlanması için ek rapor talebiyle itiraz ediyoruz."),
        ("davali", "Rapora katılıyoruz; tahmini kalemin hükme esas alınmamasını talep ediyoruz.")],
    4: [("hakim", "Taraf beyanları ve bilirkişi raporu değerlendirildi; hüküm açıklanacaktır.")],
}

_KARAR = {
    "sonuc": "kismen_kabul",
    "gerekce": ("Örnek karar: Taraf iddia ve savunmaları, sunulan belgeler ve bilirkişi raporu birlikte değerlendirilmiş; "
                "belgelerle ispatlanan kısım kabul edilmiş, ispatlanamayan kalemler reddedilmiştir. "
                "Bu metin önceden belirlenmiş bir örnektir, gerçek bir değerlendirme değildir."),
    "hukum": ["Davanın kısmen kabulüne", "İspatlanamayan kalemlerin reddine", "Yargılama giderlerinin oranlanmasına"],
    "basis": ["HMK m.190"],
    "riskler": [
        {"risk": "Gerekçede ispat yükünün kimde olduğu açık yazılmazsa istinafta eksik inceleme gerekçesi doğabilir.", "cozum": "Gerekçede ispat yükünü ve değerlendirilen delilleri tek tek yazın."},
        {"risk": "Hesaba esas alınan bilirkişi kalemi tahmini ise hesap hatası bozma sebebi olabilir.", "cozum": "Ek rapor alıp kesin tutara göre hüküm kurun."},
    ],
}

_REACT = {
    "hakim": "Beyanı tutanağa geçirdik; karşı taraf varsa cevabını versin.",
    "davaci": "Beyana katılıyoruz; ancak dosyadaki belgeler talebimizi desteklemektedir.",
    "davali": "Bu beyana itiraz ediyoruz; hukuki ve belgesel dayanağı gösterilmemiştir.",
    "bilirkisi": "Teknik açıdan, sunulan belgeler çerçevesinde değerlendirme yapılabilir.",
}


def _turn(who: str, text: str, basis: list[str] | None = None) -> dict:
    return {"who": who, "text": text, "basis": basis or [], "law": [law_ref(c) for c in (basis or [])], "docs": []}


def _suggestions(side: str) -> list[str]:
    if side == "hakim":
        return ["Davalı vekiline ayıp ihbarı süresini sor", "Bilirkişiden eksik kalemi açıklamasını iste", "Delil listelerini tamamlamaları için süre ver"]
    return ["Hâkimden delil listesini tutanağa geçirmesini iste", "Karşı vekile belge asıllarını sunması gerektiğini söyle", "Bilirkişiden ek rapor talep et"]


def beat(side: str, stage_idx: int, transcript: list[dict], interv: dict | None, manual: list[str]) -> dict:
    stage_idx = max(0, min(stage_idx, len(STAGES) - 1))
    last = stage_idx == len(STAGES) - 1
    judge = side == "hakim"
    turns: list[dict] = []
    text = ((interv or {}).get("text") or "").strip()
    target = (interv or {}).get("target")
    mode = (interv or {}).get("mode")
    karar = None
    if interv and mode == "hukum" and judge:
        sonuc = interv.get("sonuc") or "kismen_kabul"
        turns.append(_turn("hakim", f"Hüküm: {text or 'Taraf beyanları ve deliller değerlendirilmiştir.'}"))
        karar = {**_KARAR, "sonuc": sonuc, "law": [law_ref(c) for c in _KARAR["basis"]]}
    elif interv and text:
        if mode == "puppet" and target in CHARS:
            turns.append(_turn(target, text))
            others = [k for k in ("hakim", "davaci", "davali") if k != target and k not in manual]
        else:
            own = side if side in CHARS else "davaci"
            speaker = own if mode == "order" else (target if target in CHARS else own)
            turns.append(_turn(speaker, f"{text}"))
            others = [k for k in ("hakim", "davaci", "davali", "bilirkisi") if k != speaker and k not in manual]
        for k in others[:2]:
            turns.append(_turn(k, _REACT[k], ["HMK m.190"] if k == "hakim" else None))
    else:
        for who, line in _SCRIPT[stage_idx]:
            if who in manual or (judge and who == "hakim"):
                continue
            turns.append(_turn(who, line))
    if last and not judge and "hakim" not in manual and karar is None:
        karar = {**_KARAR, "law": [law_ref(c) for c in _KARAR["basis"]]}
    done = (interv is None or karar is not None) and not (last and karar is None)
    return {
        "stage_idx": stage_idx, "stage_name": STAGES[stage_idx]["name"], "turns": turns, "stage_done": done,
        "suggestions": _suggestions(side), "karar": karar,
        "dersler": ["Önceden belirlenmiş örnek: müdahaleleriniz sahnede tepki doğurdu.", "Gerçek AI anahtarıyla bu kısım sizin müdahalelerinize göre üretilir."] if karar else [],
        "finished": bool(karar), "idle": not turns,
    }


def guide(role: str) -> dict:
    if role == "hakim":
        return {
            "role": "hakim", "hazir": False, "hazir_neden": "Delil ve bilirkişi aşamaları tamamlanmadan karar için bilgi eksik.",
            "eksikler": ["Eksik kalan hesap kalemi bilirkişi tarafından netleştirilmeli."],
            "uyusmazlik": [{"konu": "Borcun varlığı", "davaci": "Bedel ödenmedi.", "davali": "Edim eksik ifa edildi.", "durum": "cekismeli"}],
            "ispat": [{"konu": "Bedelin ödenmediği", "yuk": "davaci", "neden": "Alacak iddiasını ileri süren taraf ispatlar.", "basis": ["HMK m.190"], "law": [law_ref("HMK m.190")], "docs": []}],
            "sorular": [{"kime": "davali", "soru": "Edimin ifa edildiğini gösteren belgeniz var mı?"}, {"kime": "bilirkisi", "soru": "Tahmini kalemin kesin tutara etkisi nedir?"}],
            "sonraki": {"adim": "Delil listelerini tamamlatın, bilirkişiden ek rapor isteyin.", "neden": "Karar öncesi eksik kalemi gidermek için.", "basis": ["HMK m.266"], "law": [law_ref("HMK m.266")]},
            "yollar": [{"sonuc": "kismen_kabul", "kosul": "Belgeli kısım ispatlanır, tahmini kalem ispatlanamazsa.", "bozma_riski": "Gerekçede kalem kalem değerlendirme yoksa eksik inceleme.", "basis": ["HMK m.114"], "law": [law_ref("HMK m.114")]}],
            "mock": True,
        }
    ours = "davacı" if role == "davaci" else "davalı"
    return {
        "role": role, "durum": f"Örnek: {ours} taraf belgeli kısımda güçlü, hesap kaleminde zayıf.",
        "guclu": [{"nokta": "Sözleşme ve fatura ile iddia belgelenmiş.", "basis": ["HMK m.190"], "law": [law_ref("HMK m.190")], "docs": []}],
        "zayif": [{"nokta": "Tahmini hesap kalemi", "risk": "Hükme esas alınmayabilir.", "cozum": "Ek rapor talep edin."}],
        "karsi_hamle": [{"hamle": "Karşı taraf belge içeriğine itiraz eder.", "karsilik": "Asılları ve yazışmaları sunun."}],
        "eksik_belge": ["Teslim/ödeme dekontları"],
        "hamleler": [
            {"hamle": "Hâkimden eksik kalemin ek raporla netleştirilmesini iste.", "neden": "Tahmini kalemi kesinleştirir.", "risk": "düşük", "basis": ["HMK m.266"], "law": [law_ref("HMK m.266")]},
            {"hamle": "Karşı vekile ifa belgelerini sunması gerektiğini söyle.", "neden": "İspat yükünü karşı tarafa çevirir.", "risk": "orta", "basis": ["HMK m.190"], "law": [law_ref("HMK m.190")]},
        ],
        "sureler": ["Bilirkişi raporuna itiraz süresi"],
        "mock": True,
    }


def ask(question: str) -> dict:
    return {"answer": "Örnek yanıt: AI anahtarı tanımlı olmadığı için bu soruya dosyaya özgü yanıt üretilemiyor. Anahtar eklendiğinde yanıt dava özetinize göre üretilir.", "law": [law_ref("HMK m.190")], "mock": True}
