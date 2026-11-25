"""Counterfactual paths for the twenty fictional briefs.

Each tuple traces a distinct hypothesis through a check, a finding and its
consequence to a disposition. Only the separate recorded path cites a judgment.
"""
from typing import NamedTuple


class Alternative(NamedTuple):
    condition: str
    check: str
    finding: str
    reason: str
    decision: str


A = Alternative
DECISIONS = {
    "C01": ("Geçitteki yaralanma nedeniyle mahkûmiyet korundu", [
        A("Yaya aracın dönüşünden sonra geçide girdiyse", "Kavşak saatiyle servis görüntüsü eşlenir", "Eşlenmiş karelerde minibüs yayayı son ana kadar örtüyorsa", "Sürücünün temkinli dönüşte dahi çarpmayı önleyemeyeceği kabul edilir", "Önlenebilir bir sürüş kusuru ispatlanamadığından beraat"),
        A("Sürücü geçitte yayaya yol vermediyse ancak yaralanma tartışmalıysa", "İlk muayene ile önceki kol filmleri karşılaştırılır", "Kırığın daha eski olduğu ve çarpmanın yeni yaralanmaya yol açmadığı saptanırsa", "Geçiş ihlali ile isnat edilen yaralanma arasındaki bağ kurulamaz", "Taksirle yaralama isnadından beraat"),
    ]),
    "C02": ("D-14 tabletini aldığı ispatlanamayan sanık beraat etti", [
        A("Turnike saati hatalıysa", "Sevkiyat görüntüsü bağımsız saatle eşlenir", "D-14 seri numaralı tableti sanığın izinsiz çıkardığı açıkça görülürse", "Önceki zimmet kapalı olsa da sonraki alma fiili görüntüyle belirlenir", "D-14 tabletinin çalınması nedeniyle mahkûmiyet"),
        A("Sayım kaybı yanlış raf kaydından kaynaklanıyorsa", "D-14 seri numarası diğer raf teslimleriyle karşılaştırılır", "Cihaz sevkten önce başka rafta bulunmuşsa", "Depodan izinsiz çıkarma iddiasının maddi temeli ortadan kalkar", "Hırsızlık fiili gerçekleşmediği için beraat"),
    ]),
    "C03": ("Dört projektör için KYOK’a itiraz reddedildi", [
        A("P-43–P-46 için izinsiz satış kaydı ortaya çıkarsa", "Alıcıdaki seri numaraları teslim listesiyle karşılaştırılır", "Organizatörün cihazları kendi hesabına sattığı ve mahsuba izin verilmediği doğrulanırsa", "İtiraz üzerine açılan davada teslim amacına aykırı tasarruf sabit görülür", "Dört projektöre ilişkin güveni kötüye kullanma suçundan mahkûmiyet"),
        A("Dört cihazın iadesine ilişkin yeni makbuz bulunursa", "Makbuzdaki numaralar ve teslim alanın imzası incelenir", "P-43–P-46’nın malikine teslim edildiği doğrulanırsa", "İade edilmeme ve izinsiz devir iddiası dayanaksız kalır", "Projektörlerin devredildiği iddiası hakkında KYOK"),
    ]),
    "C04": ("Sahte kamera ilanı nedeniyle mahkûmiyet korundu", [
        A("İlanı başka bir kişinin yönettiği ileri sürülürse", "D-72 oturumu ile çekim onayı karşılaştırılır", "Onay ve ilan üçüncü kişiye bağlanır, sanığın iştiraki gösterilemezse", "Hesap sahipliği hileye katıldığını tek başına açıklamaz", "18.600 TL’lik ilan dolandırıcılığı isnadından beraat"),
        A("İlanın gerçek bir kamera kiralamasına ait olduğu savunulursa", "Seri numarası ve yükleme öncesi yazışmalar incelenir", "Kameranın hazırlandığı ve sevkin sonradan iptal edildiği doğrulanırsa", "Bedel alınırken aldatma kastı ispatlanamaz", "Sözleşmenin ifa edilmemesi hakkında dolandırıcılık isnadından beraat"),
    ]),
    "C05": ("Saldırıyı durdurmak için yapılan tek itme nedeniyle beraat", [
        A("İtme metal çubuk kaldırılmadan önce gerçekleşmişse", "Giriş kamerasında ilk hareket belirlenir", "Sanığın karşı tarafı sebepsiz ittiği ve omuz yaralanmasına yol açtığı görülürse", "İlk saldırı iddiası çürütüldüğünden savunma gerekçesi kabul edilmez", "Omuz yaralanmasına neden olan itmeden mahkûmiyet"),
        A("Çubuk kaldırılmış ancak tehlike sona ermişse", "Çubuğun bırakılması ile ikinci müdahalenin sırası incelenir", "Tehlike geçtikten sonra ayrıca itme ve düşme görülürse", "Yaralanmaya yol açan sonraki hareket savunma için gerekli görülmez", "Tehlike sona erdikten sonraki yaralamadan mahkûmiyet"),
    ]),
    "C06": ("6.400 TL’lik onarım edimi yerine getirildi, KYOK verildi", [
        A("Uzlaştırmada alt panel bedeli üzerinde anlaşma sağlanamazsa", "Soruşturmada D-7 fotoğrafı ve şüphelinin beyanı karşılaştırılır", "Yeni göçüğün kasten vurulan tekmeden kaynaklandığı yargılamada doğrulanırsa", "Eski menteşe arızası ayrılarak alt paneldeki kasıtlı zarar sabit görülür", "D-7 alt paneline zarar vermekten mahkûmiyet"),
        A("Göçüğün olaydan önce de bulunduğu ileri sürülürse", "Önceki vardiyaya ait tarihli panel görüntüsü incelenir", "Aynı göçük önceki kayıtta varsa ve yeni hasar saptanmazsa", "Tekmeyle meydana gelen ilave bir zarar için yeterli şüphe oluşmaz", "Panel hasarı isnadı hakkında KYOK"),
    ]),
    "C07": ("Vardiya amiri mahkûm edildi, bakım sorumlusu beraat etti", [
        A("Amirin üretim emri bakım tamamlandı bildirisine dayanıyorsa", "P-4 teslim formundaki onayı kimin verdiği araştırılır", "Bakım sorumlusu arızayı bilerek güvenli teslim onayı vermiş ve amirce görülebilir uyarı bırakmamışsa", "Çalıştırmaya neden olan kusurlu teslim bakım sorumlusuna yüklenir", "Bakım sorumlusu mahkûm, kusuru ispatlanamayan amir beraat"),
        A("Arızalı presi çalıştırma kararını birlikte verdikleri ileri sürülürse", "Etiketin kaldırılması ve üretim talimatının zamanları karşılaştırılır", "İkisinin de açık arızayı bildiği ve hattı birlikte devreye aldığı doğrulanırsa", "Her iki görevlinin müdahalesi yaralanmayla ilişkilendirilir", "P-4 yaralanmasında iki görevli hakkında mahkûmiyet"),
    ]),
    "C08": ("Senedin bedelini değiştirdiği ispatlanamayan sanık beraat etti", [
        A("Bedel satırındaki yetkisiz ekleme sanığa bağlanırsa", "Asıl senet, karşılaştırma yazıları ve kullanım kaydı incelenir", "Yetkisiz değişikliği sanığın yapıp senedi takibe verdiği doğrulanırsa", "Salt teslimin ötesinde değiştirme ve kullanma fiilleri belirlenir", "Değiştirilmiş senede ilişkin isnattan mahkûmiyet"),
        A("Bedel satırının doldurulması için yazılı onay varsa", "Onayın tarihi ve tutarı senet aslıyla karşılaştırılır", "Tutar verilen yetkiyle örtüşüyorsa", "Kalem farklılığı yetkiye aykırı değişiklik göstermeye yetmez", "Yetkisiz değişiklik gerçekleşmediğinden beraat"),
    ]),
    "C09": ("Dokuz yıl hapis cezası temyizde onandı", [
        A("Sokak kaydı başka bir kişiye aitse", "Kameralar arasındaki geçiş kareleri eşlenir", "Görüntü kesintisinde farklı bir montlu kişinin rotaya katıldığı görülürse", "Kapalı yüz ve mont yaması sanığın kimliğini belirlemeye yetmez", "Market kasasına ilişkin yağma isnadından beraat"),
        A("Görüntünün çekildiği sırada sanık başka yerdeyse", "Turnike hareketi bağımsız vardiya görüntüsüyle karşılaştırılır", "Aynı anda başka tesiste olduğu kesintisiz kayıtla doğrulanırsa", "Sokak görüntüsündeki teşhis maddi kayıtlarla çelişir", "Fiili sanığın işlemediği saptanarak beraat"),
    ]),
    "C10": ("Sesli mesajın incelenmesinden sonra tehditten mahkûmiyet", [
        A("Yedek telefonda ilgili ses kaydı bulunamazsa", "Sohbet kimliği ve geri alınabilen iletiler incelenir", "Eksik ekran görüntüsünü tamamlayan yeni bir kayıt çıkmazsa", "İtirazda ilk kararı değiştirecek tehdit delili bulunmaz", "KYOK’a itiraz reddedilir"),
        A("Sesli mesaj yeni delil sayılsa ancak gönderici tartışmalıysa", "Açılan davada hesap ve cihaz zaman çizelgeleri karşılaştırılır", "Tehdit içeren iletiyi sanığın gönderdiği belirlenemezse", "Sözlerin tehdit niteliği failin kimliğindeki şüpheyi gidermez", "Tehdit mesajının sanığa aidiyeti kanıtlanamadığından beraat"),
    ]),
    "H01": ("F-18 için 330.000 TL alacak kabul edildi", [
        A("İki ödeme de F-18’e aitse", "330.000 TL’lik dekonttaki F-17 açıklaması mutabakatla karşılaştırılır", "Alıcı ve satıcı F-18 mahsubunu teyit etmişse", "210.000 TL ve 330.000 TL aynı 540.000 TL borcu kapatır", "F-18 için 540.000 TL bakiye alacak talebi reddedilir"),
        A("İki ödeme de önceki teslimlere aitse", "Önceki fatura bakiyeleri ile tarafların mahsup kayıtları incelenir", "F-18 açıklamasının taraflarca düzeltilip iki ödemenin de önceki borçlara sayıldığı doğrulanırsa", "Teslim edilen F-18 kalıplarının bedeli tamamen açık kalır", "F-18 için 540.000 TL alacak kabul edilir"),
    ]),
    "H02": ("54 saat fazla çalışma kabul edildi, 18 saat reddedildi", [
        A("Eksik iki haftanın da yükleme listeleri bulunursa", "Sekiz haftalık imzalar vardiya çıkışlarıyla eşlenir", "Ara dinlenmeleri düşüldüğünde 72 saat çalışma doğrulanırsa", "İstenen bütün sürenin çalışılarak geçirildiği kanıtlanır", "72 saatlik fazla çalışma alacağı tümüyle kabul edilir"),
        A("Geç çıkışlar servis bekleme süresine aitse", "Son yükleme imzalarının saati servis çizelgesiyle karşılaştırılır", "Vardiya sonrasında fiilî çalışma gösterilemezse", "Turnike kaydı tek başına fazla çalışmayı kanıtlamaz", "72 saatlik fazla çalışma talebi reddedilir"),
    ]),
    "H03": ("32.400 TL depozito iadesine hükmedildi", [
        A("Cam çatlağı kiracı taşınmadan önce mevcutsa", "Giriş ve çıkış fotoğraflarındaki çatlaklar karşılaştırılır", "Aynı iz girişte bulunur ve boya olağan kullanım kapsamında kalırsa", "Depozitodan düşülebilecek kiracı kaynaklı zarar kalmaz", "36.000 TL depozitonun tamamı iade edilir"),
        A("Cam dışında boyada da olağan dışı hasar varsa", "Teslim fotoğrafları ile aynı adrese ait gider belgeleri eşlenir", "3.600 TL cam ve ayrıca 8.400 TL boyama zararı kanıtlanırsa", "36.000 TL’den toplam 12.000 TL zarar mahsup edilir", "24.000 TL depozito iadesi kabul edilir, kalan 12.000 TL reddedilir"),
    ]),
    "H04": ("Koltuk takımı için 90.000 TL bedel indirimi kabul edildi", [
        A("Açılma teslimden sonraki taşımadan kaynaklanıyorsa", "Bağlantı sayısı ile taşıma izleri incelenir", "Dört vidanın takılı olduğu ve sonradan zorlandığı belirlenirse", "Teslim anında üretim kusuru kanıtlanamaz", "Koltuk takımı için bedel indirimi reddedilir"),
        A("Montaj kusuru daha sınırlı bir değer kaybı yaratıyorsa", "Ayıplı ve ayıpsız değerler yeniden karşılaştırılır", "Değer oranı 0,95 olarak doğrulanırsa", "600.000 TL satış bedelinde indirim 30.000 TL ile sınırlanır", "30.000 TL bedel indirimi kabul edilir, fazlası reddedilir"),
    ]),
    "H05": ("25 m² eksik imalat ve ödenmemiş hakediş ayrı hükme bağlandı", [
        A("Ölçüm ekinde 60 m² boşluğun tamamı sayılıyorsa", "580 m² net yüzeye sözleşmedeki boşluklar eklenir", "Hakedişin 640 m² teslimle örtüştüğü belirlenirse", "Eksik imalat kalmaz, ödenmemiş hakediş karşı talebi desteklenir", "Eksik imalat istemi reddedilir, ödenmemiş hakediş kabul edilir"),
        A("Sözleşmede bütün boşluklar hariç tutuluyorsa", "Net alan ile tahakkuka giren metraj karşılaştırılır", "640 m² yerine 580 m² teslim doğrulanırsa", "60 m² fark hesaplanır ve karşı alacak gerçekleşen imalatla sınırlanır", "60 m² eksik imalat bedeli kabul edilir, hakediş 580 m² üzerinden değerlendirilerek ödenmemiş kısmına hükmedilir"),
    ]),
    "H06": ("Çalışma gücü kaybı için 3.200.000 TL kabul edildi", [
        A("Primlerin on iki ay ödendiği ileri sürülürse", "Eksik aylara ait banka ve ücret kayıtları eşlenir", "Tam yıl geliriyle hesaplanan zarar 4.800.000 TL olarak doğrulanırsa", "Gelir kaybı talebinin tamamı kazaya bağlanır", "4.800.000 TL tazminatın tamamı kabul edilir"),
        A("Gelir azalması kazadan önce başlamışsa", "İşbaşı, bordro ve tıbbi dönemler karşılaştırılır", "Kazada ek çalışma gücü veya gelir kaybı oluşmadığı saptanırsa", "Talep edilen ekonomik zarar ile kavşak kazası arasında bağ kurulamaz", "4.800.000 TL gelir ve çalışma gücü kaybı talebi reddedilir"),
    ]),
    "H07": ("180 m² için tapu iptali ve tescil talebi reddedildi", [
        A("Paftaya aktarım hatası bütün şeridi etkiliyorsa", "İlk tesis sınırları sabit nirengilerle yeniden uygulanır", "180 m²’nin tamamının müvekkilin kaydına ait olduğu belirlenirse", "Karşı parsel kaydının bu şeridi hatalı içerdiği kabul edilir", "180 m² için tapu iptali ve müvekkil adına tescil"),
        A("Aktarım hatası yalnız şeridin bir kesimindeyse", "Keşifte hatalı kesim koordinatlarıyla ayrılır", "Kayıt hatası 60 m² ile sınırlı bulunursa", "Kalan 120 m² için çitin konumu tek başına yeterli olmaz", "60 m² tescil edilir, 120 m² yönünden talep reddedilir"),
    ]),
    "H08": ("Soğuk oda stok zararı için 420.000 TL kabul edildi", [
        A("Kompresör arızası teminattan önce başlamışsa", "İlk servis ihbarı alarm cihaz koduyla eşlenir", "İhbarın kapı sensörüne değil aynı kompresöre ait olduğu belirlenirse", "Stok hasarını doğuran olay poliçe süresinin dışında kalır", "420.000 TL sigorta tazminatı talebi reddedilir"),
        A("Arıza teminat içindeyken imha miktarı tartışmalıysa", "İmha parti numaraları giriş ve çıkış fişleriyle eşlenir", "Yalnız 300.000 TL net stok kaybı aynı arızaya bağlanırsa", "Kalan 120.000 TL zarar bu olay için kanıtlanamaz", "300.000 TL sigorta tazminatı kabul edilir, 120.000 TL reddedilir"),
    ]),
    "H09": ("Yeniden yargılamada 510.000 TL tazminat kabul edildi", [
        A("Ek raporun hüküm öncesinde usulünce bildirildiği ortaya çıkarsa", "Tebligat tarihi ve cevap dilekçesinin kaydı karşılaştırılır", "Yanıt olanağının verildiği ve kesintilerin sınırı aştığı belirlenirse", "Hizmet düzeyinin ihlali nedeniyle fesih haklı görülür", "900.000 TL erken fesih tazminatı talebi reddedilir"),
        A("Yeniden incelemede tüm kesintiler bakım pencerelerine denk gelirse", "Bakım takvimi sözleşmedeki istisnalarla eşlenir", "Hizmet düzeyinin korunduğu ve istenen zararın tamamı kanıtlanırsa", "Fesih sebebi ortadan kalkar, belgeli kayıp talebi karşılar", "900.000 TL erken fesih tazminatı kabul edilir"),
    ]),
    "H10": ("155 m² için bedel kabul edildi, kalan 85 m² için ret korundu", [
        A("Yol 240 m²’nin tamamını fiilen kullanıma kapatmışsa", "Yürüyüş yüzeyi ve erişilemeyen şerit birlikte ölçülür", "155 m² yüzey yanında 85 m²’ye de erişim kalmadığı saptanırsa", "Fiilî kullanımın etkisi taşınmazın talep edilen bütün bölümüne yayılır", "240 m²’nin tamamı için ölçülen bedel kabul edilir"),
        A("85 m²’ye erişim sürse de değeri azalmışsa", "Geçiş koşulları ile önceki ve sonraki değerleme karşılaştırılır", "Dolaylı değer kaybı ayrı ve ölçülebilir bulunursa", "155 m² yüzey bedeli ile kalan kesimdeki kayıp ayrı hesaplanır", "155 m² bedeli ve 85 m²’de kanıtlanan değer kaybı kabul edilir"),
    ]),
}
