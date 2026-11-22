"""Chronological, cross-referenced exhibits for the approved fictional histories."""
from dataclasses import dataclass
from datetime import date, timedelta

from app.db.dossier_exhibits import EXHIBITS
from app.db.dossier_stories import Story


@dataclass(frozen=True)
class Entry:
    key: str
    title: str
    author: str
    day: date
    text: str

    @property
    def filename(self):
        return f"{self.key} · {self.title}.pdf"


def _history(s: Story) -> list[Entry]:
    result = []
    route = set(s.route.split())
    criminal = s.code.startswith("C")
    year = 2019 if "echr" in route else 2022
    day = date(year, int(s.code[1:]), 7)
    institution = s.court
    prosecutor = "Cumhuriyet Başsavcılığı"
    counsel = f"{s.client} vekili"
    opposition = f"{s.opponent} vekili"
    refs = {}

    def add(key, title, author, days, body, *links):
        nonlocal day
        day += timedelta(days=days)
        if day.weekday() > 4:
            day += timedelta(days=7 - day.weekday())
        number = f"{s.code}-{len(result) + 1:02}"
        parts = [title, f"Kurgusal örnek · {s.code} · Evrak {number}",
                 f"{day:%d.%m.%Y}   |   Düzenleyen: {author}", s.title, body]
        if links:
            parts.append("Dosyada başvurulan evrak\n" + "\n".join(
                f"{refs[k].key} · {refs[k].title} · {refs[k].day:%d.%m.%Y}" for k in links))
        entry = Entry(number, title, author, day, "\n\n".join(parts))
        refs[key] = entry
        result.append(entry)
        return key

    def request(text):
        return f"Uyuşmazlık\n{s.facts}\n\nAçıklama\n{s.claim}\n\nİstem\n{text}"

    add("meeting", "İlk görüşme tutanağı", counsel, 0,
        f"Görüşmeye katılan: {s.client}. Karşı taraf: {s.opponent}.\n\nMüvekkilin aktardığı olay\n{s.facts}\n\nGörüşme sonunda belirlenen çalışma\n{s.claim} İlk inceleme için şu kayıtlar talep edildi: {s.exhibit}.")
    add("mandate", "Vekâletname örneği", s.client, 1,
        f"Vekâlet veren: {s.client}\nDosya konusu: {s.title}\nKarşı taraf: {s.opponent}\n\nBu dosyada dilekçe ve delil sunulması, dosyanın incelenmesi, tebligatların teslim alınması ve kanun yolu işlemlerinin izlenmesi için temsil kapsamı kaydedilmiştir.\n\nBu kurgusal nüsha temsil veya noterlik işlemi için kullanılamaz.")
    if "handwritten" in route:
        account = ("Kapının yanında duruyordum. Çubuğu kaldırdığını gördüm. Kolunu kendimden uzaklaştırmak için ittim. Merdivendeki kişinin o sırada bizi görebildiğini sanmıyorum."
                   if criminal else "Anahtarları verdiğim gün camdaki çatlağı birlikte gördük. Ev sahibi boyadan bahsetmedi. Teslimden önce odaların fotoğrafını telefonumla çektim. Depozitoyu banka yoluyla ödemiştim.")
        add("account", "Müvekkilin kendi yazdığı olay özeti", s.client, 0,
            f"Kendi anlatımım\n“{account}”\n\nOkunabilir döküm\n{account}", "meeting")
    attachments = EXHIBITS[s.code]
    initial = attachments[:1] if "reopen" in route else attachments
    attachment_keys = []
    for index, (title, author, content) in enumerate(initial, start=1):
        attachment_keys.append(add(f"attachment{index}", title, author, 0, content))
    add("exhibit", "Delil eki ve kayıt dökümü", counsel, 1,
        f"Sunulan kayıtlar\n{chr(10).join(item[0] for item in initial)}.\n\nKayıtların ilişkin olduğu olay\n{s.facts}\n\nİncelenmesi istenen husus\n{s.claim} Karşı açıklamanın karşılaştırılacağı kayıtlar yukarıda sıralanmıştır.", *attachment_keys)
    if "mediation" in route:
        add("mediation", "Arabuluculuk son tutanağı", "Arabulucu", 12,
            f"Görüşme konusu\n{s.claim}\n\nTaraf açıklamaları\n{s.client} ile {s.opponent} arasında uyuşmazlık kapsamı görüşüldü. {s.response}\n\nSonuç\nTaraflar ortak bir çözüm üzerinde anlaşamadı.")
    add("filing", "Şikâyet ve delil dilekçesi" if criminal else "Dava dilekçesi", counsel if not criminal or s.code not in {"C02","C05","C08","C09"} else opposition, 3,
        (f"İhbar ve anlatım\n{s.facts}\n\nDosyaya sunulan kayıtlar\n{s.exhibit}.\n\nİstem\nSöz konusu kayıtların toplanması ve olayın taraf anlatımlarıyla karşılaştırılması talep olunur."
         if criminal else request("Delillerin toplanması ve açıklanan talep hakkında karar verilmesi arz olunur.")), "exhibit")
    if "kyok" in route or "reopen" in route:
        add("kyok", "Kovuşturmaya yer olmadığına dair karar", prosecutor, 35,
            f"İnceleme konusu\n{s.facts}\n\nDeğerlendirme\n" + (s.judgment if "kyok" in route else
            "İlk ekran görüntüsünde sözlerin bağlamı ve muhataba yönelik tehdit yeterince belirlenemedi. Mevcut kayıtla kamu davası açılmasına yeterli şüphe bulunmadığı değerlendirildi."), "filing", "exhibit")
        if "reopen" in route:
            title, author, content = attachments[1]
            add("new_exhibit", title, author, 1, content)
        add("objection", "KYOK kararına itiraz dilekçesi", counsel, 5,
            request("Kararın kaldırılması ve belirtilen delillerin incelenmesi talep olunur.") + "\n\nİtiraz konusu\n" + s.challenge, "kyok", *(["new_exhibit"] if "reopen" in route else []))
        add("objection_result", "İtiraz hakkında hâkimlik kararı", "Sulh Ceza Hâkimliği", 25,
            s.end if "kyok" in route else "Yedek cihazdaki yeni ileti, ilk kararda incelenmemiştir. İtiraz kabul edilerek yeni kayıt yönünden işlem yapılması için dosya başsavcılığa gönderilmiştir.", "objection", "kyok")
        if "kyok" in route:
            return result
    if "reconciliation" in route:
        add("settlement", "Uzlaştırma raporu", "Uzlaştırmacı", 28, f"Katılanlar\n{s.client} ve {s.opponent}.\n\nGörüşülen kalemler\n{s.finding}\n\nEdim\n{s.challenge} Alt panelin yenilenmesi ve 6.400 TL giderin ödenmesi kararlaştırıldı.", "exhibit")
        add("receipt", "Edim ifası ve servis makbuzu", "Onarım servisi", 5, "D-7 alt panel değişimi tamamlandı. Malzeme ve işçilik toplamı 6.400 TL teslim alındı. Üst menteşe bu iş emrine dahil edilmedi.", "settlement")
        add("final", "Uzlaştırma üzerine KYOK", prosecutor, 7, s.judgment + "\n\nSonuç\n" + s.end, "settlement", "receipt")
        return result
    if criminal:
        add("indictment", "İddianame", prosecutor, 34,
            f"Olay ve isnat\n{s.facts}\n\nToplanan deliller\n{s.exhibit}.\n\nKarşı anlatım\n{s.response}\n\nİstem\nBelirtilen olay ve kayıtlara ilişkin isnadın duruşmada değerlendirilmesi için kamu davası açılması talep olunur.", "filing", "exhibit")
    add("order", "Tensip zaptı", institution, 4,
        f"Dosyanın konusu\n{s.title}.\n\nİlk işlemler\nTaraf bilgilerinin ve tebligat adreslerinin kontrolüne, {s.exhibit.lower()} kayıtlarının dosyada okunabilir nüsha olarak bulunmasının sağlanmasına ve taraflara usulüne göre bildirim yapılmasına karar verildi.", "indictment" if criminal else "filing")
    if not criminal:
        add("answer", "Cevap dilekçesi", opposition, 10,
            f"Davaya cevap\n{s.response}\n\nÇekişme\n{s.facts}\n\nSonuç ve istem\nDayanak kayıtların birlikte değerlendirilmesi ve karşılanmayan talep kısmının reddi istenir.", "filing")
        if "counter" in route:
            add("counter", "Karşı dava dilekçesi", opposition, 0, f"Son hakediş talebi\n{s.response}\n\nÖlçü yöntemi\nPencere boşluklarının ölçüm ekindeki ayrı hesabıyla, teslim edilen kaplamaya ilişkin karşılığın ödenmesi istenir.", "exhibit", "answer")
        if "exchange" in route:
            add("reply", "Cevaba cevap dilekçesi", counsel, 7,
                f"Karşı tarafın savunması\n{s.response}\n\nMüvekkilin beyanı\n{s.claim} Savunmanın {s.exhibit.lower()} kayıtlarıyla karşılaştırılmasını talep ederiz.", "answer", "exhibit")
            add("rejoinder", "İkinci cevap dilekçesi", opposition, 7,
                f"Cevaba cevap üzerine\n{s.claim}\n\nCevabımız\n{s.response} İlk cevaptaki çekişmeli hususlara bağlı kalıyor ve karşı görüşün delil ikamesinden sonra değerlendirilmesini istiyoruz.", "reply")
        add("evidence", "Delil dilekçesi ve ek listesi", counsel, 5, f"Delil listesi\n{s.exhibit}.\n\nİspat konusu\n{s.claim}\n\nDosyadaki yeri\nİlk dilekçe ekindeki kayıtlar, karşı tarafın cevabı üzerine aşağıdaki evrak numarasıyla tekrar gösterilmiştir.", "exhibit", "answer")
        add("preliminary", "Ön inceleme duruşma zaptı", institution, 35,
            f"Talep\n{s.claim}\n\nSavunma\n{s.response}\n\nUyuşmazlık\n{s.title}. Taraflar uzlaşamadı. Çekişmeli vakıalar ile incelenecek kayıtlar tutanağa geçirildi.", "filing", "answer", "evidence")
    add("hearing", "Birinci duruşma tutanağı", institution, 28,
        f"Taraflar dinlendi\n{s.claim}\n{s.response}\n\nDosyadaki kayıtlar\n{s.exhibit}. Taraflardan kayıtların kaynağı ve olayla bağlantısı hakkındaki açıklamaları alındı.", "order", "exhibit")
    add("interim", "Ara karar evrakı", institution, 0,
        f"Araştırılacak husus\n{s.title}.\n\nAra karar\n{s.exhibit} ile taraf beyanlarının karşılaştırılmasına, eksik asılların getirtilmesine ve toplanan kayıtların sonraki celsede tarafların incelemesine açılmasına karar verildi.", "hearing")
    if "institution" in route:
        add("letter", "Kuruma yazılan müzekkere", institution, 1, f"İstenen kayıt\n{s.exhibit}.\n\nTalep kapsamı\n{s.facts} Belirtilen işleme ait kurum kayıtlarının tarih sırasına göre dosyaya gönderilmesi rica olunur.", "interim")
        add("letter_reply", "Müzekkere cevabı ve kayıt özeti", "İlgili kurumun kayıt birimi", 14,
            f"İlgi\n{s.title} dosyasında gönderilen yazı.\n\nKayıt özeti\n{s.finding}\n\nİletilen belgeler\n{s.exhibit}.", "letter")
    if "witness" in route:
        add("summons", "Tanığa ihtaratlı tebligat", institution, 1, f"Dinleme konusu\n{s.facts}\n\nBildirim\nOlayın görüldüğü yer ve zamana ilişkin kişisel gözlemlerin açıklanması için duruşmaya çağrı ile mazeretsiz gelmemenin sonuçlarına ilişkin ihtar tebliğe çıkarıldı.", "interim")
        add("witness", "Tanık dinleme tutanağı", institution, 18,
            f"Tanığa yöneltilen soru\nOlayı hangi noktadan ve hangi zaman aralığında gözlemlediniz?\n\nKayıtlarla karşılaştırılan anlatım\n{s.finding}\n\nTarafların soruları\n{s.challenge}", "summons", "exhibit")
        add("witness_response", "Tanık beyanına karşı savunma" if criminal else "Tanık beyanına karşı beyan", counsel, 4,
            f"İncelenen anlatım\n{s.finding}\n\nBeyana karşı açıklama\n{s.challenge}\n\nİstem\nGözleme dayanan bölümün kayıtlarla birlikte değerlendirilmesi talep edilir.", "witness")
    if "inspect" in route:
        add("inspection", "Keşif tutanağı", institution, 17, f"Yerinde inceleme\n{s.exhibit}.\n\nGözlem ve ölçümler\n{s.finding}\n\nTaraf beyanı\n{s.challenge}", "interim", "exhibit")
    if "medical" in route:
        add("medical", "Adli Tıp Kurumu raporu", "Kurgusal adli tıp inceleme heyeti", 24,
            "İstenen inceleme\nMuayene kayıtlarındaki yaralanmanın bildirilen olayla uyumunun değerlendirilmesi.\n\nTıbbi gözlem\n" +
            {"C01":"Sol ön kol görüntülemesinde radius kırığı izlendi. Bulgular künt darbe öyküsüyle uyumludur. Tıbbi kayıtlar araç hızını belirlemeye elverişli değildir.",
             "C05":"Omuzda yüzeysel yumuşak doku hassasiyeti kaydedildi. Tek itme ve düşme öyküsüyle uyumludur. İlk hareketin kimden geldiği bu bulgudan çıkarılamaz.",
             "C07":"El cerrahisi kaydında sağ elde ezilme ve tendon onarımı mevcut. Lezyon pres mekanizmasıyla bildirilen sıkışmaya uygundur. Görev dağılımı tıbbi değerlendirmenin dışındadır."}[s.code], "exhibit")
    if "expert" in route:
        add("expert", "Bilirkişi inceleme raporu", "Kurgusal bilirkişi", 25,
            f"Görevlendirme ve yöntem\n{s.exhibit} karşılaştırılarak kayıtlar arasındaki farklar araştırıldı.\n\nİnceleme bulguları\n{s.finding}\n\nSınır\nHukuki nitelendirme ve nihai değerlendirme mahkemeye aittir.", "interim", "exhibit")
        add("expert_response", "Bilirkişi raporuna karşı beyan", opposition, 7,
            f"Tartışılan bulgu\n{s.finding}\n\nİtirazın dayanağı\n{s.challenge}\n\nİstem\nÇekişmeli kaydın ayrıca değerlendirilmesi talep olunur.", "expert")
        if s.code != "H09":
            add("expert_accept", "Rapor doğrultusunda hüküm talebi", counsel, 1,
                f"Benimsenen tespit\n{s.finding}\n\nBeyan\nKayıtların desteklediği tespit yönünden rapora katılıyor, bu tespitin hüküm kurulurken dikkate alınmasını talep ediyoruz.", "expert")
    add("last_session", "Delillerin tartışıldığı duruşma tutanağı", institution, 28,
        f"Okunan kayıtların ortak bulgusu\n{s.finding}\n\nTarafların çekişmeli bıraktığı husus\n{s.challenge}", "hearing", "exhibit")
    if criminal:
        submission = {
            "C01": "Geçiş önceliğine aykırı manevra ve kırık arasındaki bağ nedeniyle taksirle yaralamadan mahkûmiyet talep edildi.",
            "C02": "Görüntü ve tanıkla güvenilir kimlik tespiti yapılamadığı için beraat talep edildi.",
            "C04": "İlan ve banka işlemlerini aynı cihazın yönetmesi nedeniyle nitelikli dolandırıcılıktan mahkûmiyet talep edildi.",
            "C05": "Metal çubukla başlayan müdahalenin tek itmeyle durdurulması nedeniyle meşru savunma hükümlerinin uygulanması istendi.",
            "C07": "Çalıştırma talimatını veren amir için mahkûmiyet, durdurma etiketini bırakan bakım sorumlusu için beraat istendi.",
            "C08": "Değişikliği sanıkla ilişkilendiren kesin bir tespit bulunmadığından beraat talep edildi.",
            "C09": "İkinci kamera görüntüsü, rota ve mont işaretinin birlikte değerlendirilmesiyle yağmadan mahkûmiyet talep edildi.",
            "C10": "Sesli iletinin göndericiyle bağı ve konuşma içeriği nedeniyle tehditten mahkûmiyet talep edildi.",
        }[s.code]
        add("opinion", "Esas hakkında mütalaa", prosecutor, 0,
            f"Dosyada tartışılan deliller\n{s.exhibit}.\n\nEsasa ilişkin değerlendirme\n{s.finding}\n\nMahkemeye sunulan görüş\n{submission}", "last_session")
        add("defense", "Mütalaaya karşı savunma dilekçesi", "Sanık müdafii", 7,
            f"Mütalaada esas alınan tespit\n{s.finding}\n\nSavunma\n{s.challenge}\n\nSon söz\nSanığın lehine olan kayıtların da gerekçede ayrıca karşılanması talep olunur.", "opinion", "exhibit")
    if "constitutional" in route and "retrial" in route:
        add("supplement", "Ek bilirkişi raporu", "Kurgusal bilirkişi", 7, "Hizmet kesintisi çizelgesinin son hesabına iki planlı bakım penceresi de dahil edildi. Bu ek hesapla sözleşmedeki hizmet düzeyinin sağlanmadığı değerlendirildi.", "expert")
    add("decision", "Gerekçeli karar", institution, 2 if "supplement" in refs else 18,
        f"Uyuşmazlık ve tarafların görüşü\n{s.title}. {s.response}\n\nDelillerin değerlendirilmesi\n" + ("Ek rapordaki kesinti süresi sözleşme sınırını aştığından fesih haklı görüldü." if s.code == "H09" else s.finding) + "\n\nHüküm\n" +
        (s.judgment.split(" İstinaf")[0] if s.code == "H09" else s.judgment), "last_session", "exhibit")
    add("decision_service", "Gerekçeli karar tebliğ kaydı", institution, 3,
        f"{s.code} sayılı kurgusal dosyada gerekçeli karar taraf vekillerine bildirildi. Teslimler bu kaydın düzenlendiği tarihte tamamlandı.", "decision")
    for flag, title, court in [("appeal","İstinaf","Bölge Adliye Mahkemesi"), ("cassation","Temyiz","Yargıtay")]:
        if flag not in route:
            continue
        previous = "decision" if flag == "appeal" else "appeal_result"
        add(flag, title + " başvuru dilekçesi", "Başvuran taraf vekili", 6,
            f"Başvurulan hüküm\n{refs[previous].title}.\n\nBaşvuru sebebi\n{s.challenge}\n\nİstem\nHükmün belirtilen itiraz yönünden incelenmesi talep olunur.", previous, "exhibit")
        add(flag + "_reply", title + " başvurusuna cevap", "Karşı taraf vekili", 6,
            f"Başvuruya cevap\n{s.finding}\n\nİstem\nBu kayıtların gerekçede değerlendirildiği gözetilerek başvurunun reddi talep olunur.", flag, previous)
        if flag == "appeal":
            add("appeal_form", "İstinaf formu", institution, 2, f"Gönderen merci: {institution}\nDosya: {s.code} · {s.title}\nBaşvurunun konusu: {s.challenge}\nEkler: Başvuru, cevap, karar ve dayanak kayıtlar.", flag, flag+"_reply", previous)
        add(flag+"_result", court + " kararı", court, 107,
            f"İnceleme konusu\n{s.challenge}\n\nEsas alınan tespit\n{s.finding}\n\nSonuç\n" +
            ("Bölge Adliye Mahkemesi, gerekçeye yöneltilen itirazı inceleyerek istinaf başvurusunu esastan reddetti." if flag == "appeal" else
             "Yargıtay, hükmün tartışılan kayıtlarla gerekçelendirilmiş olduğunu değerlendirerek hükmü onadı."), flag, flag+"_reply", previous)
    if "constitutional" in route:
        add("service", "Nihai karar tebliğ kaydı", institution, 4,
            f"{s.client} vekiline nihai karar nüshası bu kaydın düzenlendiği tarihte teslim edildi. Başvuru evrakı bu tebliğ kaydına bağlanmıştır.", "cassation_result")
        add("aym", "Anayasa Mahkemesine bireysel başvuru", counsel, 12,
            f"Başvuru konusu\n{s.challenge}\n\nBaşvurucunun aktardığı olaylar\n{s.facts}\n\nİhlal iddiası\n" +
            ("Hükmü etkileyen rapora cevap verme fırsatı verilmediği için çelişmeli yargılama ilkesinin ihlal edildiği ileri sürüldü." if "retrial" in route else
             "Taşınmazın kullanılabilirliği hakkında sunulan itirazların mülkiyet hakkı yönünden karşılanmadığı ileri sürüldü."), "decision", "cassation_result", "service")
        add("aym_result", "AYM bireysel başvuru kararı", "Kurgusal Anayasa Mahkemesi dosyası", 310,
            ("Ek rapor hükümden önce tarafa bildirilmedi. Rapora etkili cevap olanağı sağlanmaması nedeniyle ihlal tespit edildi ve yeniden yargılama için karar gönderildi." if "retrial" in route else
             "Ölçümler ve değerleme itirazlarının derece mahkemelerince karşılandığı değerlendirildi. Başvuru açıkça dayanaktan yoksun bulunarak kabul edilemez görüldü."), "aym")
        if "retrial" in route:
            add("new_hearing", "Yeniden yargılama duruşma tutanağı", institution, 55, "Ek rapor tebliğ edildi. Taraflar iki planlı bakım penceresi hakkında dinlendi. Pencerelerin sözleşmede kesinti süresinin dışında tutulduğu belirlendi.", "aym_result", "supplement")
            add("new_decision", "Yeniden yargılama gerekçeli kararı", institution, 17, s.end, "new_hearing")
        if "echr" in route:
            add("echr", "AİHM başvuru formu ve ek listesi", counsel, 30,
                f"Başvurucu: {s.client}\nŞikâyet: Mülkiyet hakkı kapsamında ölçüm ve değerleme işlemleri.\n\nOlayların özeti\n{s.facts}\n\nİç hukuk yolları\nGerekçeli karar, istinaf, temyiz ve bireysel başvuru kararları tarih sırasıyla aşağıdadır. Şeridin tamamının kullanımına etkisinin değerlendirilmesi istenir.", "decision", "appeal_result", "cassation_result", "aym_result")
            add("echr_result", "AİHM kabul edilebilirlik kararı", "Kurgusal AİHM dosyası", 270,
                f"Başvurunun kapsamı\n{s.challenge}\n\nDeğerlendirme\nUlusal dosyada şeritler ayrı ölçülmüş ve erişim olanağı gerekçede açıklanmıştır. Dosyada ileri sürülen hususlar temelinde başvuru açıkça dayanaktan yoksun görülerek kabul edilemez bulunmuştur.", "echr")
    last = next(reversed(refs))
    add("closure", "Kapanış ve sonuç kaydı", counsel, 35, f"Uyuşmazlık\n{s.title}\n\nSonuç\n{s.end}", last)
    return result

def entries(s: Story) -> list[Entry]:
    history = _history(s)
    flags = set(s.route.split())
    notes = []
    if s.code.startswith("C"):
        notes.append("Ceza dosyasında hukuk yargılamasına ait ön inceleme ve replik/düplik evreleri uygulanmadı.")
        if not any(e.title == "İddianame" for e in history):
            notes.append("Soruşturma aşamasında kapanış nedeniyle iddianame ve yargılama evrakı oluşmadı.")
        if "medical" not in flags:
            notes.append("Bu olayda adli tıp değerlendirmesi alınmadı.")
    if "handwritten" not in flags:
        notes.append("Ayrı bir müvekkil olay özeti verilmedi. İlk anlatım görüşme tutanağında kayıtlıdır.")
    for flag, note in [("inspect", "Yerinde keşif yapılmadı."), ("witness", "Ayrı bir tanık dinleme işlemi yapılmadı."),
                       ("cassation", "Bu dosya temyize taşınmadı."), ("constitutional", "Bireysel başvuru yapılmadı.")]:
        if flag not in flags:
            notes.append(note)
    lines = [f"{e.key}   {e.day:%d.%m.%Y}   {e.title} · {e.author}" for e in history]
    index = Entry(s.code + "-00", "Kronolojik evrak dizini", "Dosya sorumlusu", history[-1].day,
                  "Kronolojik evrak dizini\n\nKurgusal örnek · " + s.code + " · " + s.title +
                  "\n\nMüvekkil: " + s.client + "\nKarşı taraf: " + s.opponent +
                  "\n\n" + "\n".join(lines) + "\n\nUygulanmayan işlemler\n" + "\n".join(notes) + "\n\nSonuç\n" + s.end)
    return [index, *history]
