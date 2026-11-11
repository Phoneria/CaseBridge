# Büro yönetimi

Bu değişiklik yerel geliştirmedir; canlıya yayın veya yeni müşteri teslim onayı değildir. `todo.md` içindeki müşteri teslim koşulları geçerlidir.

## Ekranlar

- `/buro`: yalnızca büro yöneticisine ait yönetim özeti, ekip kapasitesi, kritik süreler, mali/zaman kayıtları, inceleme, müvekkil/iletişim, başvuru, kontrol listesi, izin, paylaşım, erişim, AI kullanım, destek, işlem geçmişi ve çöp kutusu.
- `/platform`: CaseBridge ekibine ait büro araması, durum/davet filtreleri ve hesap sayaçları. Büro profili bağlantıları `/platform/[id]` adresine açılır.
- `/platform/[id]`: iletişim ve fatura bilgileri, kurulum adımları, kullanım/operasyon bilgileri, paket/limitler, müşteri ilişkisi, destek ve platform işlem geçmişi.
- `/calisma-alanim`: avukatın görev ve inceleme alanı veya kısıtlı personel/müvekkilin kendisine ayrılmış alanı.

## Veri ve yetki kuralları

- Müşteri yönetimi istekleri büroyu oturumdan alır. İstemciden büro kimliği kabul edilmez. Platform hesapları müşteri yönetimi API'sini kullanamaz.
- Platform profili ve operasyon bilgileri müşteri dosya metinlerini, belge adlarını, mali kayıtları ve müşteri iç notlarını içermez. Platform geçmişi yalnızca büro/profil, platform yönetici ve destek işlemlerini gösterir.
- Yönetim kayıtlarının türüne özel Pydantic şemaları, tarih/tutar sınırları ve aynı büroya ait dava/kullanıcı/belge doğrulamaları vardır. Serbest JSON alanları kabul edilmez.
- Güncelleme, çöp kutusu ve geri yükleme sürüm kontrolü kullanır. Geçmiş kayıtları eklemeli tutulur; kullanıcı tarafından değiştirilemez. Çöp kutusu yeni yönetim kayıtlarına aittir; mevcut belge silme davranışını değiştirmez.
- Kısıtlı erişim profili mevcut kullanıcı rolünden ayrı saklanır. Yönetici hesapları bu alandan sınırlandırılamaz. Personel rol adları aynı dosya odaklı operasyon alanını kullanır; muhasebe mali/zaman kayıtlarıyla, müvekkil ise yayımlanmış paylaşımlarla sınırlıdır.
- Kısıtlı hesaplar için ortak kimlik doğrulama bağımlılığı eski dava, arama, rapor, belge, AI ve yönetim uçlarını da reddeder. Yalnızca hesap/şifre işlemleri ve kapsamı ayrıca doğrulanan çalışma alanı uçları açıktır.
- Davetli kısıtlı kullanıcı ve dosya erişimi tek işlemde oluşturulur. Davet bağlantısı kullanılmadan erişim profili kaydedilmiş olur. Yeni hesaplar varsayılan olarak kısıtlı müvekkil profiliyle davet edilir.
- Müvekkil portalında dosyaya atanmış olmak yeterli değildir: açıkça yayımlanmış bir paylaşımın alıcısı olmak gerekir. Sadece paylaşımda seçilen belgeler indirilebilir; ham dosya, taslak, iç not ve mali defter API'leri kapalıdır. Erişimi kaldırma, paylaşımı taslağa çevirme veya çöp kutusuna taşıma görünürlüğü kaldırır.
- Büro anahtarlarını ekleme/test/ayrı aktivasyon ve önceki anahtarı koruma akışları değiştirilmedi. Yeni kayıtlarda API anahtarı veya şifre alanı bulunmaz.

## İş akışları

- Kritik süreler son tarih, dayanak, sorumlu, farklı bir yedek ve açık doğrulama içerir. Dayanak veya tarih formda değişirse doğrulama işareti temizlenir. Doğrulanmadan görüldü/tamamlandı durumuna geçilemez.
- Doğrulanmış süreler mevcut e-posta işçisi ve teslim defterini kullanır. Sorumlu/yedeğe seçilen günlerde hatırlatma; geciken ve tamamlanmayan kayıt için yöneticilere günlük bildirim yapılır. Mevcut tekrar önleme ve başarısız teslim denemeleri geçerlidir. Arşivli dosyalar ve askıdaki bürolar bildirim üretmez. Bildirim işçisi ve e-posta yapılandırmasının etkin olması gerekir.
- İnceleme taslak olarak başlar. İncelemeye gönderilen içeriğin sürümü sabittir; atanan inceleyici notla onaylar veya düzeltme ister. Hazırlayan kişi kendi kaydının inceleyicisi olamaz. Onaylı içerik değiştirilemez; yeni bir kayıt gerekir. İçerik/belge değişiklikleri sürümü artırır.
- Kontrol listeleri açılış, duruşma ve kapanış şablonlarına veya özel adımlara sahiptir. Ön koşullar yalnızca önceki adımları gösterebilir. Ön koşul tamamlanmadan bağlı adım tamamlanamaz. Tüm adımlar tamamlanmadan liste kapatılamaz.
- İş devri aktif/arşivsiz davaları, açık görevleri, yaklaşan takvim etkinliklerini, emsal incelemelerini ve açık yönetim işlerini aynı işlemde taşır. Tam erişimli başka bir aktif avukat gerekir. Kullanıcı hesabı aktif kalabilir; mevcut pasifleştirme akışı da yönetim işlerini devreder. Devralan çalışma alanında teslim teyidi verir; yönetici ekip ekranından teyidi görür.
- İzinler başlangıç/bitiş, yedek ve onay içerir. Aynı kişi için onaylı çakışan izin reddedilir. İzin onayı dosya sahipliğini otomatik değiştirmez; ayrı devir işlemi gerekir.
- Başvurular görüşmeden dava açılışına kadar aşamalıdır. Sözleşme/belge/dava açılışı için taraf kontrolü kararı ve gerekçe gerekir; açılan dava ilişkilendirilir. Benzerlik araması yalnızca aynı büronun kayıtlı taraflarını karşılaştırır, hukuki karar vermez.

## Mali hesaplar ve kullanım

- Kararlaştırılan ücret, ücret tahsilatı, büro masrafı, masraf tahsilatı, müvekkil masraf avansı ve avans harcaması ayrı kayıtlardır. Dava değeri gelir sayılmaz.
- Para tutarları Decimal ile hesaplanır; para birimleri birleştirilmez. Kur çevrimi, vergi hesaplama veya resmî muhasebe entegrasyonu yoktur.
- Ücret bakiyesi = ücret − ücret tahsilatı. Masraf alacağı = büro masrafı − masraf tahsilatı. Avans bakiyesi = alınan avans − avans harcaması.
- İç maliyet = dakika × saatlik iç maliyet / 60. Tahmini katkı = ücret − iç maliyet − büro masrafı + masraf tahsilatı. Genel ofis giderleri ve vergiler dahil değildir. Avanstan yapılan gider ikinci kez büro masrafı olarak kaydedilmemelidir.
- AI ekranı kaydedilmiş analiz ve sohbet tokenlarını, işlem/başarısızlık sayılarını ve büroya özel uyarı eşiğini gösterir. Tahmini maliyet kullanıcının girdiği ortalama token maliyetinden hesaplanır; sağlayıcı fiyatı olduğu iddia edilmez. Ölçülmeyen ses, belge alımı ve duruşma kullanımı maliyete dahil değildir. Uyarı eşiği sağlayıcıdaki harcama sınırı değildir.
- Abonelik ve ödeme durumu yerel takip içindir; ödeme alınmaz ve gecikme otomatik askıya alma yapmaz. Aktif/davet bekleyen tüm kullanıcılar (müvekkiller dahil) koltuk sayısına katılır. Yeni davetler ve belge yüklemeleri kayıtlı limitleri kontrol eder. Mevcut veriler limit düşürülünce silinmez.
- Son kullanım alanı bu güncellemeden itibaren kaydedilir; daha eski oturumlar geriye dönük üretilmez. Dava hareketsizlik uyarısı yalnızca ana kaydın güncellenme tarihidir, dosyada hiç hukuki çalışma yapılmadığının göstergesi değildir.

## Şema ve doğrulama

Alembic revizyonu `d8e9f0a1b2c3`, `b9d3e7f1a520` üzerine eklenir. `management_records`, `management_audits`, `workspace_access`, `firm_profiles`, `work_transfers` tabloları ve kullanıcı son kullanım tarihi eklenir. Yayında mevcut veritabanına `alembic upgrade head` uygulanmalıdır. Geri alma yeni tablolardaki verileri kaldırır; üretimde yedek ve geri dönüş planı olmadan downgrade yapılmamalıdır.

Gerçek doğrulama sonuçları `todo.md` içindeki bu geliştirmeye ait kayıtta tutulur. Testlerde sentetik büro, kullanıcı ve belge verileri kullanılır. Gerçek müşteri veya API anahtarıyla işlem yapılmaz.
