"""Conditional findings when a particular exhibit or objection is evaluated.

Percentages are illustrative shares at that checkpoint. The existing continuation
receives the remainder. Only the existing historical path is marked as recorded.
"""
from typing import NamedTuple


class Fork(NamedTuple):
    stage: str
    exhibit: str
    percent: int
    finding: str
    reason: str
    decision: str


FORKS = {
    "C01": [
        Fork("evidence", "Kamera zaman çizelgesi", 26, "Saat farkı birden fazla referansla giderilemezse", "Dönüş anında yayanın görünür olduğu başka delille de belirlenemiyorsa sürüş kusuru ispatlanamaz.", "Geçit görüntüsündeki zaman belirsizliği nedeniyle beraat"),
        Fork("challenge", "Acil servis muayene fişi", 19, "Kırığa itiraz kabul edilir ancak çarpmaya bağlı yumuşak doku yaralanması doğrulanırsa", "Görüş hattındaki yayaya çarpma sabittir. Yeni tıbbi değerlendirme yalnız kırık ile kaza arasındaki bağı dışlar.", "Taksirle yaralamadan mahkûmiyet, kırığa bağlı ağırlaştırma uygulanmaz"),
    ],
    "C02": [
        Fork("evidence", "Zimmet ve iade fişi", 23, "İade edilen tabletin seri numarası farklı çıkarsa", "D-14 zimmeti üzerindeki şüphe, cihazı kimin aldığına ilişkin bağımsız delil bulunmadıkça hırsızlığı ispata yetmez.", "Zimmet farkına rağmen hırsızlık isnadından beraat"),
        Fork("challenge", "Turnike hareket listesi", 17, "Tanığın mont teşhisi dışlanır ancak D-14’ün vardiya çıkışında alındığını gösteren kayıt doğrulanırsa", "Yeni bulgu alma fiilini 19.10 sevkinden önceye yerleştirir. 18.04 çıkış kaydı bu bulguyu çürütmez.", "Sevk saatinden önce alınan tablet yönünden mahkûmiyet"),
    ],
    "C03": [
        Fork("evidence", "Açık hesap yazışması", 24, "Mahsup mesajının yalnızca öneri olduğu anlaşılırsa", "Kabul edilmemiş öneri mülkiyet devrini göstermez. İadede gecikme dışında güveni kötüye kullanmayı destekleyen kayıt da yoksa yeterli şüphe oluşmaz.", "Kabul edilmemiş mahsup önerisi ve iade gecikmesi hakkında KYOK"),
        Fork("challenge", "Projektör teslim ve iade çizelgesi", 18, "İtirazdan sonra iki projektörün izinsiz satışı seri numarasıyla doğrulanırsa", "Yeni kayıtla sürdürülen soruşturma ve yargılamada tasarruf yalnız iki cihaza bağlanır. Öteki iki cihaz için iade eksikliği tek başına yeterli değildir.", "Mahkûmiyetin kapsamı izinsiz satıldığı kanıtlanan iki projektörle sınırlı tutulur"),
    ],
    "C04": [
        Fork("evidence", "Banka transfer dekontu", 22, "Çekim onayı iptal edilip tutar iade edilmiş ancak hileli ilanla para elde edildiği sabit kalmışsa", "İade, baştan beri var olan hileyi ortadan kaldırmaz. Sanığın zararı gönüllü ve tam gidermesi kararda ayrıca değerlendirilir.", "İlan dolandırıcılığından mahkûmiyet, tam giderim koşulları oluşursa cezada indirim"),
        Fork("challenge", "İlan işlem geçmişi", 21, "Cihazın ortak kullanıldığı itirazı kabul edilir ve ilanı kimin yönettiği ayırt edilemezse", "Cihaz eşleşmesi kişiye özgülenemez. Salt hesap kaydı, hileye bilerek katılımı ispatlamaz.", "Ortak cihazdan hareketle kişisel iştirak kanıtlanamadığından beraat"),
    ],
    "C05": [
        Fork("evidence", "Koridor görüş krokisi", 20, "Girişteki görüş hattının kapıcının bakış açısından da kapalı olduğu saptanırsa", "İlk hareketi kimin yaptığı görüntüden de çıkarılamıyorsa sanığın saldırıyı savuşturduğu savunması çürütülemez.", "Hukuka aykırı yaralama ispatlanamadığından beraat"),
        Fork("challenge", "Omuz muayene kaydı", 24, "İlk hareket tartışması sürerken düşmenin itmeden önce gerçekleştiği gösterilirse", "Zamanı doğrulanan kayıt, omuz bulgusunu sanığa yüklenen itmeden ayırır. Başka bir yaralanma saptanmamıştır.", "Omuz yaralanması ile isnat edilen hareket arasında bağ kurulamadığından beraat"),
    ],
    "C06": [
        Fork("evidence", "Onarım teklifi", 28, "Taraflar para ödemesi yerine alt panelin onarılmasında anlaşırsa", "D-7 panelinin anlaşmaya uygun onarıldığı servis teslimiyle doğrulanırsa edim aynen yerine getirilir.", "Aynen onarımla uzlaşmanın tamamlanması üzerine KYOK"),
        Fork("challenge", "Kapı hasarı fotoğraf kayıt fişi", 16, "Menteşe kapsam dışında bırakıldığı hâlde alt panel edimi kesin olarak yerine getirilmezse", "Uzlaştırma edimi ifa edilmez. Devam eden yargılamada fotoğraf ve beyan yeni panel hasarının kasıtlı olduğunu doğrularsa yalnız bu zarardan hüküm kurulur.", "İfa edilmeyen uzlaşmadan sonra alt panel hasarı nedeniyle mahkûmiyet"),
    ],
    "C07": [
        Fork("evidence", "Pres bakım defteri", 25, "Köprüleme yaralanmadan sonra yapılmış ve olay anında anahtarın çalıştığı doğrulanırsa", "Uzman incelemesi yaralanmayı öngörülemeyen bağımsız arızaya bağladığında bilinen anahtar arızası ile sonuç arasında nedensellik kurulamaz.", "İsnat edilen emniyet anahtarı arızası yönünden iki sanık da beraat eder"),
        Fork("challenge", "Vardiya teslim formu", 18, "İmza itirazı üzerine üretim talimatının amire ait olmadığı anlaşılırsa", "Amirin sözlü talimatı da doğrulanamıyor ve bakım sorumlusunun durdurma bildirimi geçerliyse iki sanıktan hiçbirine hattı açma kusuru yüklenemez.", "Üretim emrinin aidiyeti çürütülünce amir ve bakım sorumlusu beraat eder"),
        Fork("alternative-2-1", "Pres bakım defteri", 15, "Birlikte talimat iddiasına rağmen bakım görevlisinin olaydan önce fiilen hattı kilitlediği doğrulanırsa", "Amirin kilidi kaldırttığı, bakım görevlisinin ise devreye almayı onaylamadığı saptanırsa ortak karar iddiası karşılanmaz.", "Kilidi kaldırttığı kanıtlanan amir mahkûm edilir, bakım görevlisi beraat eder"),
    ],
    "C08": [
        Fork("evidence", "Senet aslı inceleme fişi", 23, "İki kalem izine rağmen bedel satırında değişiklik olmadığı ilk nüshayla doğrulanırsa", "Farklı yazım aracı tek başına sahtecilik değildir. İlk nüshayla aynı bedel yer alıyorsa isnat edilen değişiklik gerçekleşmemiştir.", "Bedel satırında tahrifat bulunmadığı için beraat"),
        Fork("challenge", "Evrak teslim defteri", 21, "Teslim zinciri itirazı sonrası sanığın değişikliği bildiği ve senedi bilerek kullandığı kanıtlanırsa", "Bedeli kimin yazdığı belirsiz kalsa da sanığın değişikliği bildiğini gösteren yazışma ile senedi takibe sunduğu kayıt birlikte değerlendirilir.", "Tahrif edilmiş senedi bilerek kullanma nedeniyle mahkûmiyet"),
    ],
    "C09": [
        Fork("evidence", "Teşhis tutanağı", 21, "Teşhiste aynı kişinin tekrar tekrar gösterildiği saptanırsa", "Teşhisin güvenilirliği ortadan kalkar ve bağımsız görüntü incelemesi de sanığı ayırt edemezse yağmaya katılım ispatlanamaz.", "Güvenilir teşhis bulunmadığından yağma isnadından beraat"),
        Fork("challenge", "Kamera eşleme cetveli", 18, "İkinci görüntüdeki kişi sanık olsa da olay yerine ancak yağmadan sonra geldiği gösterilirse", "Sonradan sokakta bulunması, önceden anlaşma veya yağmaya katkı gösterilmedikçe kasayı alanlarla ortak hareketi kanıtlamaz.", "Yağmaya iştiraki sabit görülmeyen sanığın beraati"),
    ],
    "C10": [
        Fork("evidence", "Yedek cihazda bulunan ileti dökümü", 26, "Ses kaydının doğrulanmış tam metninde zarar bildiren sözler üçüncü kişinin sözlerinden alıntıysa", "Tam bağlamda sanığın tehdidi benimsemediği ve muhataba yöneltmediği anlaşılırsa isnadın maddi temeli kalmaz.", "İletinin bağlamı nedeniyle tehdit suçundan beraat"),
        Fork("challenge", "Yedek cihazda bulunan ileti dökümü", 17, "Saat farkına ilişkin itiraz kabul edilir ancak ses ve gönderici bağı bağımsız kayıtla doğrulanırsa", "Saat damgasındaki hata konuşma sırasını tek başına gösteremez. Sesli iletinin içeriği ve kişiye aidiyeti tehdidi ayrıca kanıtlar.", "Hatalı saat damgası dışlanarak doğrulanmış sesli tehditten mahkûmiyet"),
    ],
    "H01": [
        Fork("evidence", "Banka dekontları", 25, "330.000 TL’lik ödemenin 120.000 TL’si imzalı mutabakatla F-18’e ayrılırsa", "F-18’in 540.000 TL bedelinden ilk 210.000 TL ile ikinci dekontun 120.000 TL’lik kısmı düşülür.", "F-18 için 210.000 TL kabul edilir, kalan 330.000 TL reddedilir"),
        Fork("challenge", "Fatura ve cari hesap ekstresi", 18, "Mahsup itirazı reddedilir ancak bakiye için 60.000 TL iade faturası ayrıca doğrulanırsa", "İkinci ödeme F-17’de kalır. F-18’in 330.000 TL bakiyesinden teslim sonrası mal iadesi düşülür.", "Mal iadesinden sonra F-18 için 270.000 TL kabul edilir"),
    ],
    "H02": [
        Fork("evidence", "Gece yükleme çizelgesi", 23, "Yedinci haftada ayrıca 9 saat imzalı yükleme bulunur, sekizinci hafta doğrulanamazsa", "Altı haftanın 54 saatine doğrulanan 9 saat eklenir. Son haftanın geç çıkış kaydı çalışma süresini ispatlamaz.", "63 saat kabul edilir, 9 saat reddedilir"),
        Fork("challenge", "Bordro ve puantaj özeti", 17, "54 saatin 12 saatine ilişkin imzalı ödeme belgesi itiraz üzerine doğrulanırsa", "Çalışılan süre aynı kalır. Aynı dönem ve ücret üzerinden ödenmiş 12 saatin karşılığı ikinci kez tahsil edilemez.", "42 saatlik fazla çalışma ücreti kabul edilir"),
    ],
    "H03": [
        Fork("evidence", "Cam değişim faturası", 24, "Cam giderinin 1.600 TL’sini kiracının önceden ödediği belgelenirse", "3.600 TL’lik giderin yalnız 2.000 TL’si ev sahibinde kalır. Başka haklı kesinti yoksa bu tutar depozitodan düşülür.", "36.000 TL depozitodan 34.000 TL iade edilir"),
        Fork("challenge", "Anahtar teslim tutanağı", 18, "Özgün teslim fotoğrafları 2.400 TL tutarında yeni duvar hasarını da doğrularsa", "Boya yenilemesinin olağan kullanım dışındaki 2.400 TL’lik bölümü ile 3.600 TL cam gideri birlikte mahsup edilir.", "6.000 TL kesinti kabul edilerek 30.000 TL depozito iadesine hükmedilir"),
    ],
    "H04": [
        Fork("evidence", "Özel üretim sipariş çizimi", 23, "Değerleme kusurlu takımın değerini ayıpsız değerinin yüzde 80’i olarak saptarsa", "Montaj kusuru ile değer kaybı bağlantılıysa 600.000 TL’nin yüzde 20’si indirimdir. Bu tutarın istem sınırında olduğu varsayılır.", "İstem kapsamında 120.000 TL bedel indirimi kabul edilir"),
        Fork("challenge", "Servis ziyaret formları", 16, "Aynı kusur için satıcının önceden 40.000 TL indirim yaptığı belgelenirse", "Hesaplanan 90.000 TL değer farkının daha önce karşılanan bölümü düşülür.", "Önceki indirim mahsup edilerek 50.000 TL’ye hükmedilir"),
    ],
    "H05": [
        Fork("evidence", "Metraj eki", 24, "Ölçüm ekine göre boşlukların yalnız 20 m²’si sayılabilirse", "580 m² net imalata 20 m² eklenir. 640 m² hakedişin 40 m²’si teslim edilmemiştir.", "40 m² eksik imalat bedeli kabul edilir, karşı hakediş 600 m²’nin ödenmemiş kısmıyla sınırlanır"),
        Fork("challenge", "Üçüncü hakediş", 19, "615 m² hesabına itiraz sonuçsuz kalır ancak bu imalatın bedelinin tamamının ödendiği belgelenirse", "25 m² eksiklik sürer. Yapılmış imalat için açık bakiye bulunmadığından karşı talebin dayanağı kalmaz.", "25 m² eksik imalat bedeli kabul edilir, karşı dava reddedilir"),
        Fork("alternative-1-2", "Üçüncü hakediş", 22, "640 m²’nin tamamı teslim edilmiş ve son hakedişin tamamı da ödenmişse", "Teslim kanıtı asıl talebi, ödeme belgesi ise karşı davadaki bakiye iddiasını çürütür.", "Hem eksik imalat istemi hem ödenmemiş hakediş istemi reddedilir"),
    ],
    "H06": [
        Fork("evidence", "İşe dönüş çizelgesi", 23, "Tam süreli işe dönüşün hesapta kullanılandan daha erken olduğu doğrulanırsa", "Düzeltilen dönemlere göre kalan gelir kaybı 2.400.000 TL olarak belirlenirse tazminat bu kayıpla sınırlıdır.", "2.400.000 TL tazminat kabul edilir, aşan istem reddedilir"),
        Fork("challenge", "Ücret ve prim dökümü", 18, "Prim itirazı sonuçlandıktan sonra aynı zarar için 700.000 TL ödeme belgelendirilirse", "Kanıtlanan 3.200.000 TL kayıptan aynı zarar kalemine ilişkin ödeme düşülür.", "Ön ödeme mahsup edilerek 2.500.000 TL tazminata hükmedilir"),
    ],
    "H07": [
        Fork("evidence", "Kadastro sabit noktaları", 27, "Nirengi noktalarından birinin yer değiştirdiği doğrulanırsa", "Yeni sabit noktayla ölçüm kayıt sınırında yalnız 40 m² aktarım hatası gösterirse iptal bu kesimle sınırlıdır.", "40 m² için iptal ve tescil kabul edilir, kalan 140 m² reddedilir"),
        Fork("challenge", "Hava fotoğrafı karşılaştırma fişi", 18, "Fotoğraf tarihlerine itiraz kabul edilir ancak ilk tesis kaydı ve sabit noktalar mevcut sınırı doğrularsa", "Çitin ne zaman taşındığı belirlenemese de dosyada mülkiyet sınırının hatalı işlendiğini kanıtlayan ölçüm kalmaz.", "Çitin yaşı belirlenemese de kayıt hatası ispatlanamadığından 180 m² tescil talebi reddedilir"),
    ],
    "H08": [
        Fork("evidence", "Stok imha çizelgesi", 21, "İmha listesindeki 70.000 TL’lik parti olaydan önce depodan çıkarılmışsa", "Arıza dönemindeki net stoktan önceki çıkış düşüldüğünde 350.000 TL zarar teminat içindeki olaya bağlanır.", "350.000 TL sigorta tazminatı kabul edilir, 70.000 TL reddedilir"),
        Fork("challenge", "Soğuk oda alarm günlüğü", 19, "Sensör ile kompresör ayrımı korunur ancak olay başına 20.000 TL muafiyet doğrulanırsa", "Arıza teminat içindedir. Geçerli muafiyet belgeli 420.000 TL zarara bir kez uygulanır.", "Muafiyet sonrası 400.000 TL sigorta tazminatı kabul edilir"),
        Fork("alternative-2-2", "Stok imha çizelgesi", 15, "300.000 TL’lik doğrulanmış stok için sigortacının 100.000 TL avansı da belgelenirse", "Kanıtlanan zarar aynı kalır. Aynı parti ve olaya ilişkin önceki ödeme bakiyeden düşülür.", "Doğrulanan stok için kalan 200.000 TL’nin tahsiline karar verilir"),
    ],
    "H09": [
        Fork("evidence", "Bakım duyurularının teslim fişleri", 22, "Yalnız bir bakım penceresinin sözleşmeye uygun bildirildiği doğrulanırsa", "Cevap imkânı verilen rapor yalnız bu pencereyi dışlar ve kanıtlanan fesih zararını 260.000 TL olarak belirlerse kabul bu tutarla sınırlıdır.", "Yeniden incelemede 260.000 TL erken fesih tazminatı kabul edilir"),
        Fork("challenge", "Hizmet düzeyi çizelgesi", 19, "Rapor tebliğ edilip itiraz dinlendikten sonra bakım istisnasına rağmen hizmet sınırı aşılmışsa", "Usule ilişkin eksiklik giderilir. Yeni değerlendirme feshin haklı olduğunu gösterirse önceki usul ihlali tek başına tazminat doğurmaz.", "Yeniden yargılamada erken fesih tazminatı esastan reddedilir"),
    ],
    "H10": [
        Fork("evidence", "Taşınmaz ölçüm cetveli", 22, "Erişilebilir görünen bölümün 30 m²’sinin fiilen yola katıldığı anlaşılırsa", "155 m² kaplamaya erişimi tamamen kesilen 30 m² eklenir. Kalan 55 m² için kullanım kaybı kanıtlanamaz.", "185 m² için bedel kabul edilir, 55 m² yönünden istem reddedilir"),
        Fork("challenge", "Değerleme çalışma kâğıdı", 16, "85 m²’ye erişim korunur ancak 155 m²’nin birim değerine ilişkin itiraz kabul edilirse", "Düzeltilen emsal hesabı yalnız kullanılan yüzeyin bedelini değiştirir. Kalan alan için ayrıca değer kaybı kanıtlanmamıştır.", "155 m² için düzeltilmiş birim bedel üzerinden kabul, 85 m² için ret"),
    ],
}
