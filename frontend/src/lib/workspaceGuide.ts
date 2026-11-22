import type { AppUser } from '@/types';

export interface GuideTopic {
  id: string; title: string; route: string; tab?: string;
  steps: { title: string; body: string; check: string }[];
}
const topic = (id: string, title: string, route: string, rows: [string, string, string][], tab?: string): GuideTopic => ({
  id, title, route, tab, steps: rows.map(([title, body, check]) => ({ title, body, check })),
});
const bureau = (id: string, title: string, rows: [string, string, string][]) => topic(`bureau-${id}`, title, '/buro', rows, id);
const BUREAU_TOPICS: GuideTopic[] = [
  bureau('overview', 'Büro Yönetimi · Güne başlama', [
    ['Öncelikleri görün', 'Yönetim özeti; geciken görevleri, sorumlu bekleyen davaları, inceleme bekleyen işleri ve 7 gündeki duruşmaları bir araya getirir. Sayı kartları ilgili bölümü açar.', 'Güne geciken ve sahipsiz işleri ayırarak başlayın.'],
    ['Uyarının kaynağına gidin', 'Dikkat gerektiren işler listesinden ilgili kaydı açın. Ekip ve kapasite ile yaklaşan işler ve izinleri birlikte değerlendirin; yalnız dosya sayısına göre karar vermeyin.', 'Örneğin yaklaşan duruşma ile izin çakışıyorsa bir yedek ve devir planlayın.'],
    ['İşi sonuca bağlayın', 'Kritik süreyi doğrulayın, taslağı incelemeye gönderin, gerekli işi devredin. Müvekkile paylaşımlar ile yalnız seçtiğiniz içeriği yayımlayın; İşlem geçmişi ile değişiklikleri takip edin.', 'Rehberde ilerlemek bu işlemleri yapmaz; kaydı uygulamada ayrıca açmanız gerekir.'],
  ]),
  bureau('deadline', 'Kritik süre · Kaydet, doğrula, takip et', [
    ['Dosya ve sorumluyu belirleyin', 'Kritik süreler bölümünde Yeni kayıt açın. Başlık, Dava, Sorumlu ve Son tarih alanlarını doldurun. Sürenin dayanağına tebliğ veya ilgili işlem bilgisini yazın.', 'Son tarihi hukuki dayanağıyla kendiniz kontrol edin; rehber süre hesaplamaz.'],
    ['Yedek ve doğrulamayı ekleyin', 'Asıl sorumludan farklı Yedek sorumlu seçin. Dayanak ve son tarihi kontrol ettikten sonra doğrulama kutusunu işaretleyin. Tarih veya dayanak değişirse yeniden doğrulama gerekir.', 'Sorumlu izindeyken işi kimin izleyeceği belli mi?'],
    ['Hatırlatmayı planlayın', 'Hatırlatma günleri alanında son tarihten önceki günleri belirleyin; örneğin 7, 3, 1, 0. Kaydet sonrası doğrulanan sürelerde sorumlu ve yedeğe hatırlatma hazırlanır; e-posta büro bildirim servisinin açık olmasına bağlıdır.', 'Bir kayıt veya doğrulama, e-postanın teslim edildiği anlamına gelmez.'],
    ['Görüldü ile tamamlanmayı ayırın', 'Atanan kişi Çalışma Alanım üzerinden süreyi gördüğünü belirtebilir ve işi tamamladığında tamamlayabilir. Yönetici geciken tamamlanmamış süreleri takip eder.', 'Görüldü, işin tamamlandığı anlamına gelmez; sonucu kontrol edin.'],
  ]),
  bureau('team', 'Ekip ve kapasite · İş devri ve teslim', [
    ['Yükü ve izinleri karşılaştırın', 'Ekip ve kapasite kartlarında aktif dava, açık/geciken görev, 7 gündeki duruşma ve vadeli görevleri inceleyin. Planlı dakika yalnız takvim etkinliklerinden hesaplanır.', 'İzin kaydı tek başına dosya sahipliğini değiştirmez.'],
    ['Devredilecek işleri inceleyin', 'İlgili kişinin İşleri devret düğmesini açın. Açık dava ve görevleri, tamamlanmamış onay/süre/kontrol listelerini ve yaklaşan etkinlik bilgisini gözden geçirin.', 'İşleri devret toplu bir işlemdir; listeyi onaydan önce okuyun.'],
    ['Avukat ve gerekçe seçin', 'Devralacak avukat olarak listede sunulan aktif, kısıtsız bir avukatı seçin. Devir gerekçesini yazıp İşleri devret ile açıkça onaylayın. Kaynak hesap aktif kalır; geçmiş ve arşivli işler korunur.', 'Yalnız tek dava ataması gerekiyorsa Dava atamaları üzerinden ilerleyin.'],
    ['Teslim teyidini izleyin', 'Devir teslim durumu bölümünde dava/görev sayılarını ve Teslim teyidi bekliyor durumunu kontrol edin. Devralan kişi Çalışma Alanım üzerinden teslimi teyit eder.', 'Devir tamamlanması ile teslimin alındığı teyidi ayrı aşamalardır.'],
  ]),
  bureau('approval', 'İnceleme ve onay · Taslaktan onaylı sürüme', [
    ['Taslağı hazırlayın', 'İnceleme ve onay bölümünde Yeni kayıt açın. Dava ve inceleyici olacak Sorumlu kişiyi seçin. İnceleyici kaydı hazırlayan kişiden farklı olmalıdır. İlgili belgeyi ve İncelenecek taslak / açıklama alanını doldurun.', 'Belge seçiminin doğru davaya ait olduğunu kontrol edin.'],
    ['İncelemeye geçin', 'Taslak hazır olduğunda İncele / düzenle ile açıp Durum alanında İnceleme bekliyor seçin ve kaydedin. İncelemedeki içerik sabittir; inceleyici atanan işi kendi çalışma alanında değerlendirir.', 'Göndermeden önce içeriğin son sürümünü okuyun.'],
    ['Kararı ve notu okuyun', 'İnceleyici onay veya düzeltme kararı için inceleme notu girer. Düzeltme istenirse İncele / düzenle ile içeriği revize edip yeniden İnceleme bekliyor durumunda kaydedin; yeni sürümü takip edin.', 'İnceleme notunu yalnız durum değişikliği olarak geçmeyin; istenen düzeltmeyi uygulayın.'],
    ['Onaylı sürümü koruyun', 'Onaylanan sürüm değiştirilemez. İçerik paylaşımı ayrı bir işlemdir; onay vermek müvekkile otomatik yayın yapmaz.', 'Müvekkile göndermeden önce ayrıca alıcı ve belge seçimini kontrol edin.'],
  ]),
  bureau('publication', 'Müvekkile paylaşımlar · Güvenli yayın', [
    ['Önce erişimi hazırlayın', 'Erişim bölümünden ilgili davaya müvekkil hesabı davet edin veya erişimini düzenleyin. Müvekkiller kayıt defterine kişi eklemek portal hesabı oluşturmaz.', 'Alıcı listesi yalnız seçili davaya erişimi olan müvekkilleri sunar.'],
    ['Taslak paylaşımı oluşturun', 'Müvekkile paylaşımlar bölümünde Dava seçin. Alıcıları, durum mesajını, istenen belge/işi ve varsa randevu ile paylaşılacak mali özeti hazırlayın.', 'Birden çok alıcı varsa her birinin doğru kişi olduğunu kontrol edin.'],
    ['Belgeleri tek tek seçin', 'Paylaşılacak belgeler listesinden yalnız iletmek istediğiniz dosyaları işaretleyin. İç notlar ve seçilmeyen belgeler bu yayınla paylaşılmaz.', 'Taslak kaydı henüz müvekkilin gördüğü bir yayın değildir.'],
    ['Açıkça yayımlayın', 'İçeriği kontrol ettikten sonra Durum alanında Yayımlandı seçin ve Kaydet ve yayımla ile onaylayın. Müvekkil kendi Çalışma Alanım ekranında kendisine yayımlanan içeriği görür.', 'Rehberi okumak, onay vermek veya dava erişimi tanımlamak tek başına yayın yapmaz.'],
  ]),
  bureau('finance', 'Finans · Ücret, masraf ve avans', [
    ['Doğru işlem türünü seçin', 'Finans içinde davayı seçip ücret, ücret tahsilatı, büro masrafı, masraf tahsilatı, alınan masraf avansı veya avanstan yapılan masraf kaydı ekleyin. Tutar, para birimi ve işlem tarihini girin.', 'Dava değeri mali kayıt değildir; ücret ve tahsilat farklıdır.'],
    ['Bakiyeleri karşılaştırın', 'Dava bazlı tabloda ücret, masraf ve avans bakiyelerini ayrı izleyin. Zaman kayıtları iç maliyeti etkiler; tahmini marjı bu bağlamda okuyun.', 'Avanstan ödenen masrafı ikinci kez büro masrafı yazmayın.'],
  ]),
  bureau('time', 'Zaman ve maliyet · Emeği kaydet', [
    ['Çalışmayı dosyaya bağlayın', 'Zaman ve maliyet bölümünde dava, sorumlu, çalışma tarihi, dakika ve saatlik iç maliyeti girin; para birimini seçin.', 'Takvimdeki planlı süre, gerçekleşen zaman kaydının yerine geçmez.'],
    ['Maliyeti inceleyin', 'Kaydı kaydettikten sonra dava bazlı finans tablosunda toplam dakika ve iç emek maliyetini değerlendirin.', 'Saatlik iç maliyet müşteriye kesilmiş ücret anlamına gelmez.'],
  ]),
  bureau('client', 'Müvekkiller · İlişki kaydı', [
    ['Kişiyi ve dosyalarını kaydedin', 'Müvekkiller bölümünde ad, iletişim ve şirket bilgilerini girin; müvekkilin dosyalarını seçin.', 'Bu kayıt portal erişimi vermez.'],
    ['İletişim planını güncel tutun', 'Son ve sonraki iletişim tarihlerini takip edin; görüşmenin ayrıntısını İletişim bölümünde kaydedin.', 'Portal için ayrıca Erişim ve Müvekkile paylaşımlar akışını kullanın.'],
  ]),
  bureau('communication', 'İletişim · Verilen sözü takip et', [
    ['Görüşmeyi ilişkilendirin', 'İletişim kaydında müvekkili, görüşme tarihini ve telefon/e-posta/görüşme/diğer kanalını seçin.', 'Doğru müvekkilin seçildiğini kontrol edin.'],
    ['Sonraki adımı yazın', 'Verilen söz / sonraki adım alanını doldurun, takip tarihini belirleyin. İş bir sorumlu ve süre gerektiriyorsa ayrıca görev veya kritik süre kaydı oluşturun.', 'İletişim kaydı tek başına görev atamaz veya mesaj göndermez.'],
  ]),
  bureau('lead', 'Yeni işler · Başvurudan davaya', [
    ['Başvuruyu değerlendirin', 'Başvuran, karşı taraf ve iletişim bilgilerini kaydedin. Taraf kontrolünde iki tarafın adlarını ayrı ayrı arayın; eşleşmeleri inceleyip avukat değerlendirmesi ve gerekçesini girin.', 'Eşleşme olmaması otomatik çıkar çatışması onayı değildir.'],
    ['Aşamayı ilerletin', 'Görüşme, değerlendirme, teklif, sözleşme ve belge toplama aşamalarını güncel tutun; bekleme nedenini yazın.', 'İşlemeye devam kararını avukat verir.'],
    ['Davayı ayrıca oluşturun', 'Yeni dava oluştur bağlantısıyla dosyayı açın; sonra başvuru kaydına bağlayıp Dava açıldı aşamasını seçin.', 'Başvuru durumunu değiştirmek kendiliğinden dava oluşturmaz.'],
  ]),
  bureau('checklist', 'Kontrol listeleri · Sıralı iş akışı', [
    ['Şablonu seçin', 'Dava ve sorumluyla dosya açılışı, duruşma hazırlığı, dosya kapanışı veya özel liste hazırlayın.', 'Şablonu değiştirmeden mevcut adımları gözden geçirin.'],
    ['Ön koşulları takip edin', 'Adım başlığı ve önceki adıma bağımlılığı belirleyin. Ön koşul tamamlanmadan bağlı adım işaretlenemez; önceki adım geri alınırsa bağlı tamamlanmalar da geri alınır.', 'Kutuyu işaretlemeden gerçek işin tamamlandığını kontrol edin.'],
  ]),
  bureau('leave', 'İzinler · Yedekleme planı', [
    ['İzni ve yedeği belirleyin', 'Sorumlu, başlangıç/bitiş ve yedek kişiyi seçin; izin durumunu takip edin.', 'İzin aralığındaki kritik süre ve duruşmaları kontrol edin.'],
    ['Gerekiyorsa işi devredin', 'İzin onayı dosya sahipliğini değiştirmez. Ekip ve kapasite bölümünde İşleri devret akışını ayrıca kullanın ve teslim teyidini izleyin.', 'Yedek belirlemek ile işleri devretmek ayrı işlemlerdir.'],
  ]),
  bureau('access', 'Erişim · Dosya bazında yetki', [
    ['İhtiyaca uygun rol seçin', 'Kısıtlı hesap davet et ile kişi ve e-postayı girin; çalışma alanı rolünü ve erişilecek dosyaları seçin, yetkilendirme gerekçesini yazın.', 'Muhasebe mali/zaman kayıtlarını; müvekkil yalnız açık yayınları görür.'],
    ['Davet sonucunu kontrol edin', 'Kayıt sonrası davetin gönderim sonucunu okuyun. E-posta gönderilemediyse Ayarlar kullanıcı listesinden yeniden gönderin. Mevcut hesapların Erişimi düzenle işlemiyle kapsamını güncelleyin.', 'Kısıtlı hesaplar genel arama, dışa aktarım ve AI alanlarına erişmez.'],
  ]),
  bureau('ai', 'AI kullanımı · Bütçe ve kapsam', [
    ['Ölçüm kapsamını okuyun', 'Kaydedilen token, tahmini maliyet ve işlem hatalarını inceleyin; ekrandaki kapsam açıklamasını okuyun.', 'Tahmini maliyet sağlayıcı faturası değildir.'],
    ['Uyarı eşiğini ayarlayın', 'Aylık token uyarı eşiği, ortalama birim maliyet ve para birimini belirleyip kaydedin. Bağlantı ayarları sizi Ayarlar ekranına götürür.', 'Uyarı eşiği anahtar değiştirme veya sağlayıcı harcamasına kesin durdurma değildir.'],
  ]),
  bureau('support', 'Destek · Sorunu takip et', [
    ['Talebi açıklayın', 'Destek kaydında başlık, öncelik, irtibat/takip sorumlusu ve notları girin.', 'Notlara API anahtarı veya parola eklemeyin.'],
    ['Sonucu güncelleyin', 'Açık, İşlemde ve Çözüldü durumlarıyla takibi sürdürün.', 'Kaydı oluşturmak çözümün tamamlandığı anlamına gelmez.'],
  ]),
  bureau('audit', 'İşlem geçmişi · Değişiklik izi', [
    ['İşlemi bulun', 'İşlem geçmişi bölümünde arama ve sayfalama ile ilgili kaydı bulun; aktör, işlem, zaman ve gerekçeyi okuyun.', 'İşlemin hangi kayda ait olduğunu doğrulayın.'],
    ['Değişikliği inceleyin', 'Sunulan önce/sonra bilgilerini karşılaştırın; yanlış kaydı ilgili bölümde düzeltin.', 'Geçmişi okumak kaydı geri almaz.'],
  ]),
  bureau('trash', 'Çöp kutusu · Kaydı geri getir', [
    ['Kaldırılan kaydı bulun', 'Çöp kutusundaki yönetim kayıtları hesaplamalara katılmaz. Başlık, tür ve dava bilgisini kontrol edin.', 'Dava arşivi ile yönetim kayıtlarının çöp kutusu farklıdır.'],
    ['Gerekçeyle geri yükleyin', 'Geri yükle ile gerekçe girip onaylayın; kayıt yeniden etkinleşerek ilgili hesaplamalara katılır.', 'Geri yüklemeden önce bakiye ve iş akışı etkisini değerlendirin.'],
  ]),
];
const commonTopics: GuideTopic[] = [
  topic('dashboard', 'Genel Bakış', '/dashboard', [
    ['Günün işlerini görün', 'Genel Bakış ekranındaki dava, görev ve yaklaşan iş özetlerini inceleyin. Ayrıntı için ilgili liste veya dosyayı açın.', 'Özet değerleri seçili filtrelerin bağlamında okuyun.'],
    ['İşi kaynağında takip edin', 'Görevleri Görevler, duruşma ve etkinlikleri Takvim, dosya ayrıntılarını Davalar üzerinden yönetin.', 'Özet bir kaydın yerine geçmez.'],
  ]),
  topic('cases', 'Davalar · Dosya yaşam döngüsü', '/davalar', [
    ['Dosyayı bulun veya oluşturun', 'Davalar listesini arama ve filtrelerle daraltın. Yeni dosyada taraf, mahkeme ve sorumlu bilgilerini doğrulayın.', 'İşleme başlamadan doğru dosya numarasını kontrol edin.'],
    ['Belgeleri ve emsalleri inceleyin', 'Davayı açın. Dosya belgelerine Belgeler sekmesinden ulaşın. Genel Bakış içinde İlgili emsal kararları göster düğmesi bu davaya bağlanan kararları açar.', 'Kararı ilişkilendirmeden önce mahkeme, tarih ve karar numarasını kontrol edin.'],
    ['Senaryoları ve sonucu okuyun', 'Olasılık Ağacı sekmesinde seçili dosyanın senaryolarını inceleyin. Sonuçlanan dosyanın kararını Genel Bakış üzerinden okuyun.', 'Senaryoları mahkemenin verdiği karardan ayrı değerlendirin.'],
    ['Dosyanın kaydını tamamlayın', 'Dosya ayrıntısında belge, görev, duruşma, taraf ve notları ilgili bölümlerden yönetin. Sonuç ve arşiv işlemleri öncesi devam eden işleri gözden geçirin.', 'AI çıktısı, doğrulanmış dosya bilgisi yerine geçmez.'],
  ]),
  topic('precedents', 'Emsal Kararlar', '/emsaller', [
    ['İlgili kararı bulun', 'Davalar bölümünde ilgili dosyayı açın. Genel Bakış içinde İlgili emsal kararları göster düğmesine basın.', 'Mahkeme, tarih ve karar numarasını kontrol edin.'],
    ['Tam metni değerlendirin', 'Kararın olay ve gerekçesini kendi dosyanızla karşılaştırın; inceleme durumunu güncel tutun.', 'Bir benzerlik veya atıf sayısı davanın kazanılma olasılığı değildir.'],
  ]),
  topic('calendar', 'Takvim · Plan ve takip', '/takvim', [
    ['Dönemi ve görünümü seçin', 'Ay, hafta veya ajanda görünümüyle ilgili tarih aralığını açın; tür ve kişi filtrelerini gözden geçirin.', 'Filtre nedeniyle görünmeyen işleri hesaba katın.'],
    ['Etkinlik ayrıntısını kontrol edin', 'Etkinliği açarak dosya, tarih/saat ve hatırlatmayı inceleyin; duruşmanın dosya kaydını da güncel tutun.', 'Takvim etkinliği bir kritik sürenin hukuki doğrulaması değildir.'],
  ]),
  topic('tasks', 'Görevler · Proje panosu', '/gorevler', [
    ['Görevi planlayın', 'Görev kartını açıp atanan kişiyi, önceliği ve son tarihi seçin. İşin ayrıntılarını görev notuna yazın.', 'Görevi kimin ne zamana kadar tamamlayacağı belli mi?'],
    ['Kartı taşıyın', 'Kartı İş Havuzu, Yapılacak, Devam Ediyor, İncelemede veya Tamamlandı sütununa sürükleyin. Klavyeyle işlem yapmak için aşama seçimini kullanın.', 'İnceleme bitince kartı Tamamlandı sütununa taşıyın.'],
  ]),
  topic('documents', 'Belgeler · Doğru dosyaya doğru belge', '/belgeler', [
    ['Belgeyi dosyayla eşleştirin', 'Davalar bölümünden ilgili dosyayı açıp Belgeler sekmesine geçin. Yüklemeden önce dosya numarasını ve belge adını kontrol edin.', 'Aynı isimli dosyalarda içerik ve dava numarasını karşılaştırın.'],
    ['İçeriği gözden geçirin', 'İndirdiğiniz veya analizde kullandığınız belgenin doğru sürüm olduğunu doğrulayın.', 'Belge eklemek müvekkile otomatik yayın yapmaz.'],
  ]),
  topic('analytics', 'Analitik · Veriyi yorumla', '/analitik', [
    ['Kapsamı belirleyin', 'Analitik ekranındaki filtre ve gruplamaları kontrol edip grafiklerin hangi kayıtları kapsadığını okuyun.', 'Eksik veya güncellenmemiş kayıtlar toplamları etkiler.'],
    ['Ayrıntıya inin', 'Grafik ve ilgili dosya bağlantılarından verinin kaynağını inceleyin; kararınızı kayıtlardaki ayrıntıyla destekleyin.', 'İstatistikleri kalibre edilmiş hukuki başarı olasılığı olarak yorumlamayın.'],
  ]),
  topic('reports', 'Raporlar · Paylaşmadan önce', '/raporlar', [
    ['Rapor kapsamını seçin', 'İhtiyacınıza uygun raporu ve ekrandaki filtreleri seçin; sonuçları inceleyin.', 'Doğru dönem ve dosyalar mı?'],
    ['Çıktıyı kontrol edin', 'Önizle ile raporun satırlarını inceleyin. Dönem ve dosya kapsamını doğruladıktan sonra raporu dışa aktarın.', 'Rapor indirmek müvekkil portalına yayın yapmak değildir.'],
  ]),
];
const aiTopics = [
  ['hub','CaseBridge AI','/ai','İhtiyacınıza göre dosya analizi, asistan, duruşma veya diğer araçlardan birini seçin.'],
  ['analysis','Dosya Analizi','/ai/analiz','Dosya ve kullanılacak belgeleri seçin. Analiz başlatmadan önce dosya içeriğinin güncel olduğunu kontrol edin.'],
  ['courtroom','Canlı Duruşma','/ai/durusma','Dosya ve rolünüzle oturumu açın. Yazın veya Konuş ile kayıt başlatıp Kaydı bitir ile gönderin; karşı taraf yanıtını bekleyin. Hakim değerlendirmesi için ayrıca Bitir kullanın.'],
  ['chat','Hukuk Asistanı','/ai/sohbet','Dosya bağlamını ve sorunuzu belirleyin. Yanıtta dayanakları ve eksik bilgileri kontrol ederek devam sorusu sorun.'],
  ['sufle','Sufle','/ai/sufle','Örnek görüşmeleri inceleyin veya görüşme başlatın. Mikrofon iznini kontrol edin; kaynak alıntılı kartları okuyun. Bitir ile son sesin işlenmesini ve özeti bekleyin; gerekiyorsa dışa aktarın. Sayfadan ayrılmak kaydedilmeyen görüşmeyi kaybettirir.'],
  ['counter','Karşı Taraf Analizi','/ai/karsi-taraf','Dosyayı ve taraf bağlamını seçin; karşı argümanları dayanaklarıyla birlikte inceleyin.'],
  ['directed','Yönetilen Duruşma','/ai/yonetmen','Dosya ile sahneyi başlatın. Karakter ve yönlendirme kontrolleriyle aşamaları ilerletin; değerlendirmeyi inceleyin.'],
  ['map','Bilgi Haritası','/ai/harita','Haritadaki kanun ve madde düğümlerini seçin; bağlantıları ve sunulan kaynak ayrıntılarını inceleyin.'],
  ['scenarios','Olasılık Ağacı','/ai/olasilik','Örnek dava veya büro dosyasını seçin. Dal seçerek dayanak, koşul, eksik ve çelişen bilgileri okuyun; Metin alternatifi ile ağacı liste halinde inceleyin. Varsayımlar ve destek ağırlığı hukuki kazanma olasılığı değildir.'],
].map(([id,title,route,body]) => topic(`ai-${id}`, title, route, [
  ['Bağlamı hazırlayın', body, 'Rehber sağlayıcı çağırmaz; işlemi araç ekranında açıkça başlatırsınız.'],
  ['Sonucu doğrulayın', 'AI çıktısını kaynak belge ve hukuki değerlendirmeyle kontrol edin. Eksik bilgi varsa dosyayı tamamlayın; bağlantı sorunu varsa Ayarlar durumunu inceleyin.', 'Bu araçlar karar desteğidir. Kaynağı olmayan sonucu doğrulanmış olgu saymayın.'],
]));
const account = topic('account', 'Hesabım', '/hesabim', [
  ['Bilgilerinizi kontrol edin', 'Hesabım ekranında profil ve sunulan hesap ayarlarınızı inceleyin.', 'Doğru e-posta ve ad bilgisi kullanın.'],
  ['Değişikliği kaydedin', 'Gerekli alanları düzenleyip ekrandaki kaydetme işlemini tamamlayın; sonucu kontrol edin.', 'Parolanızı veya anahtarınızı notlara eklemeyin.'],
]);
function settings(admin: boolean, platform = false) {
  return topic('settings', 'Ayarlar · Görünüm ve AI bağlantısı', '/ayarlar', [
    ['Durumu okuyun', 'Görünüm tercihlerinizi ve AI bağlantı durumunu inceleyin. Açık/koyu tema rehbere de uygulanır.', 'Bağlantı hatasında ekrandaki açıklamayı okuyun.'],
    ['Anahtar yetkisini ayırın', admin ? `${platform ? 'Platform' : 'Yalnız kendi büronuzun'} anahtar adayını ayrı kaydedip test edin. Kaydetmek aktif anahtarı değiştirmez. Başarılı aday için ayrıca açık Etkinleştir işlemi gerekir; önceki anahtar korunur.` : 'Avukat bağlantı durumunu görebilir; büronun anahtarını değiştirmek için büro yöneticisine başvurur.', 'Gerçek anahtarı rehbere veya destek notlarına yazmayın.'],
  ]);
}
function workspace(user: AppUser) {
  const position = user.workspace_position;
  const client = position === 'client'; const accounting = position === 'accountant';
  return topic('workspace', `Çalışma Alanım${client ? ' · Müvekkil' : accounting ? ' · Muhasebe' : ''}`, '/calisma-alanim', [
    ['Size açılan kapsamı görün', client ? 'Yalnız size açıkça yayımlanan mesajları, istenen işleri, randevuyu, mali özeti ve seçili belgeleri okuyun.' : accounting ? 'Yetkili dosyaların mali ve zaman kayıtlarını inceleyin. İç notlar, dilekçeler ve belgeler muhasebe rolüne gösterilmez.' : 'Size açılan dosyaları, görevleri ve operasyon kayıtlarını inceleyin. Kısıtlı hesapta genel arama ve AI bulunmaz.', 'Görünmeyen içerik için büro yöneticisinden kapsamı kontrol etmesini isteyin.'],
    ['İşinizi kaynağında tamamlayın', client ? 'Paylaşılan belgeleri İndir ile alın; mesajdaki belge talebi ve randevuya göre büronuzla iletişime geçin.' : accounting ? 'Mali kayıtların türünü ve para birimini kontrol edin; düzeltme gerektiren kaydı büro yöneticisine bildirin.' : 'Kendi atanan işinizde sunulan onay/düzeltme, süreyi gördüm/tamamla veya kontrol listesi kontrollerini kullanın. Devir bildirimi varsa işleri inceleyip teslimi teyit edin.', 'Yalnız ekranda yetkinize göre sunulan işlemleri kullanabilirsiniz.'],
  ]);
}
export function guideTopics(user: AppUser): GuideTopic[] {
  if (user.workspace_position) return [workspace(user), account];
  if (user.is_platform_admin) return [topic('platform', 'Platform · Büro Yönetimi', '/platform', [
    ['Büro profilini açın', 'Platform panelinden ilgili büroyu bulun; profil, kullanım ve onboarding kontrol bilgilerini inceleyin.', 'Bu ekran büro içindeki kritik süre, devir veya müvekkil yayın ekranı değildir.'],
    ['Platform kapsamını koruyun', 'Büro durum ve destek işlemlerini sunulan kontrollerden yürütün; müşteri dosyaları ve büro AI araçları bu çalışma alanında bulunmaz.', 'Büro anahtarlarını kendi platform anahtarınızla karıştırmayın.'],
  ]), settings(true, true), account];
  return [...(user.role === 'admin' ? BUREAU_TOPICS : [workspace(user)]), ...commonTopics,
    ...(user.role === 'admin' ? [topic('admin', 'Admin Paneli · Kullanıcı ve sorumlular', '/admin', [
      ['Atama ihtiyacını bulun', 'Kullanıcıları ve dava sorumlularını inceleyin; iş yükünü büro kapasitesiyle birlikte değerlendirin.', 'Dosya ataması ve toplu iş devri farklı işlemlerdir.'],
      ['Yetkiyi dikkatle düzenleyin', 'Dava sorumluluğunu ilgili kontrollerden güncelleyin. Kısıtlı dosya erişimleri için Büro Yönetimi / Erişim bölümünü kullanın.', 'İş devri gerekiyorsa Ekip ve kapasite bölümündeki liste ve teslim akışını izleyin.'],
    ])] : []), ...aiTopics, settings(user.role === 'admin'), account];
}
export function contextTopic(topics: GuideTopic[], pathname: string, tab: string | null): GuideTopic {
  return topics.find(t => t.route === pathname && t.tab === (tab ?? 'overview'))
    ?? [...topics].filter(t => pathname === t.route || pathname.startsWith(t.route + '/')).sort((a,b) => b.route.length - a.route.length)[0]
    ?? topics[0];
}
