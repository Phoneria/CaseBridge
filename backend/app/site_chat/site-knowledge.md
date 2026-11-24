<!-- site-knowledge version: 2026-11-24.1 -->
# CaseBridge — site kedisinin bilgi dosyası

Bu dosya, casebridge.com.tr üzerindeki "site kedisi"nin cevap verebileceği tek kaynaktır. Yalnızca tanıtım sitesindeki metinlerden ve depodaki ürün belgelerinden derlendi. Henüz doğrulanmamış konular ayrıca işaretlidir; kedi bu konularda bilgi vermez, demo bağlantısını önerir.

## Genel bakış {#overview}
CaseBridge, hukuk büroları için bir yapay zekâ çalışma alanıdır. Sloganı: "Her dava, başından sonuna." Biten davalardan ders çıkarır, süren davanın olası yollarını gösterir, kişisel veriyi modele gitmeden maskeler, büroyu tek bakışta toplar, müvekkil görüşmesinde avukata sufle verir ve duruşma provası yaptırır. Hedef kullanıcılar avukatlar ve hukuk bürosu yöneticileridir. CaseBridge bir web uygulamasıdır; büro kullanıcıları app.casebridge.com.tr adresinden giriş yapar.

CaseBridge karar desteği sunar; hukuki değerlendirme ve nihai karar her zaman avukata aittir. CaseBridge hukuki danışmanlık vermez.

## Dava ve büro işleri {#cases}
- Davalar: aktif ve kapanmış davalar, müvekkiller, karşı taraflar, belgeler, duruşmalar ve dava zaman çizelgesi tek yerde tutulur. Sorumlu avukat veya yönetici davayı düzenler, sonuçla (kazanıldı / kaybedildi / sulh), karar tarihi ve notla kapatır, yeniden açar veya arşivler; arşivdeki dava salt okunurdur.
- Duruşmalar ve takvim: duruşma tarihleri, toplantılar ve görevlerin son tarihleri takvimde görünür; duruşma sonucu kaydedilebilir.
- Görevler: davaya bağlı görevler oluşturulur ve büro genelinde görev listesi izlenir.
- Belgeler: PDF, DOCX ve TXT belgeler yüklenir; metin çıkarma en iyi çabayla yapılır (taranmış görüntüler için OCR yoktur).
- Devir raporu: dava başka bir avukata geçtiğinde devir özeti hazırlanır.
- Analitik ve raporlar: kazanılan/kaybedilen oranı, kategoriye göre performans ve zaman içindeki eğilimler.

## Büro yönetimi {#bureau}
"Büronuzu tek bakışta görün." Hangi avukatın hangi dava türünde daha başarılı olduğu, kimin üzerinde süresi yaklaşan iş olduğu ve iş yükünün nerede biriktiği görülür. Ekip, süre, finans ve onay kayıtları tek panelde toplanır. Yaklaşan süreler ve geciken görevler öne çıkarılır. Büro yöneticisi kendi bürosunun kullanıcılarını yönetir; roller yönetici ve avukattır.

## Geçmiş dava analizi {#past-analysis}
"Biten davayı geri sarın." Kapanmış dosyanın olayları, delilleri ve kararı yeniden okunur. Hangi aşamada farklı bir adımın sonucu değiştirebileceği görülür ve bu ders sonraki dosyaya taşınır. Analiz güçlü ve zayıf noktaları, eksik delilleri ve önerilen adımları gösterir. Değerlendirme her zaman avukatındır.

## Olasılık Ağacı {#scenario-tree}
"Süren dava nasıl biter, sizin hamleniz neyi değiştirir?" Dosyadaki kayıtlardan dallanan olası yollar ve her yolun payı gösterilir; bir hamle seçildiğinde ağaç yeniden hesaplanır. Gösterilen yüzdeler senaryo varsayımıdır; kalibre edilmiş, istatistiksel olarak doğrulanmış bir kazanma olasılığı değildir.

## Emsal kararlar ve Benzer Davalar {#precedents}
Büro, anonimleştirilmiş emsal kararlarını ayrı bir arşivde tutar; emsaller büronun kendi dava listelerine ve kazanma oranlarına karışmaz. Dava sayfasındaki "Benzer Davalar" paneli, büronun kendi emsallerini açık davaya benzerliğine göre sıralar ve neden benzer olduklarını yalnızca kayıtlı metinden gösterir: ortak terimler, ortak kanun maddeleri ve karşılıklı metin parçaları. Benzerlik puanı bir kazanma olasılığı değildir. İstenirse kısa bir yapay zekâ açıklaması alınır; açıklama yalnızca iki dosyanın kayıtlı metnine dayanır.

## CaseBridge AI {#casebridge-ai}
Uygulamadaki yapay zekâ araçları:
- Hukuk Asistanı: genel Türk hukuku sorularında yardımcı olan sohbet asistanı. Uydurma madde veya karar numarası vermemesi, emin olmadığında bunu söylemesi istenir; yanıtlar hukuki danışmanlık yerine geçmez.
- Dava simülasyonu: dört bakış açısıyla (hâkim, davacı vekili, davalı vekili, hukuk araştırmacısı) argümanları, riskleri, eksik bilgileri ve önerilen adımları çıkarır; her zaman yapay zekâ tahmini olarak etiketlenir.
- Sufle: müvekkil görüşmesini metin ya da sesle takip eder ve konuşmaya bağlı, kaynak alıntılı destek kartları çıkarır; dayanağı olmayan kart gösterilmez. Görüşme ve kartlar tarayıcı oturumunda tutulur, dışa aktarma kullanıcının açık eylemidir; kullanım öncesi müvekkilin bilgilendirilmesi istenir.
- Karşı taraf analizi ve Bilgi Haritası.
Yapay zekâ çıktısı kullanılmadan önce belge asılları, tarihler, tarafların iddiaları ve mevzuat ya da karar atıfları bağımsız kaynaklarla doğrulanmalıdır.

## Duruşma simülasyonu {#courtroom}
"Duruşmaya girmeden önce prova edin." Kullanıcı vekil olarak konuşur; karşı vekil ve hâkim yapay zekâdır. Karşı taraf delillere itiraz eder, hâkim dosyaya özel soru sorar. Oturum sonunda dört ölçütlü bir değerlendirme verilir: hukuki dayanak, delil, ikna ve usul (4 × 25 puan). Puan bir eğitim değerlendirmesidir, gerçek dava sonucu tahmini değildir.

## Veri anonimleştirme {#anonymisation}
"Kişisel veri, modele gitmeden maskelenir." Ad soyad, T.C. kimlik numarası, telefon, adres, e-posta ve IBAN gibi bilgiler etiketlenip gizlenir. Belge ya da metin kalıcı kayıt oluşturmadan okunur, hassas alanlar kategori etiketleriyle değiştirilir. Maskeli sonucu kullanıcı gözden geçirir ve onaylar. Otomatik maskeleme insan incelemesinin yerine geçmez; uygulama her sonuçta gözden geçirme ister.

## Güvenlik, gizlilik ve KVKK {#security}
- Her büronun dosyaları, kullanıcıları ve yapay zekâ anahtarı ayrı tutulur; bir büro başka bir büronun verisini göremez.
- Büroya özel yapay zekâ anahtarı: her büro kendi yapay zekâ sağlayıcı anahtarını kullanır. Anahtarlar şifreli saklanır, ekranda maskeli gösterilir; büro yöneticisi yeni anahtarı önce ayrı test eder, sonra açıkça etkinleştirir. Bir büronun istekleri başka bir büronun ya da platformun anahtarına düşmez.
- Oturumlar parolaya bağlıdır; parola değiştiğinde eski oturumlar kapanır. Giriş denemeleri sınırlandırılır.
- Kişisel veriler, anonimleştirme aracıyla modele gitmeden maskelenebilir.
- TODO: KVKK uyum beyanı (veri sorumlusu/işleyen rolleri, aydınlatma metni bağlantısı).
- TODO: Verilerin barındırıldığı yer ve ülke, yedekleme ve saklama süreleri.
- TODO: Sertifikalar ve bağımsız güvenlik denetimleri (şu an sitede hiçbiri belirtilmiyor; kedi sertifika iddiasında bulunmaz).

## Yapay zekâ nasıl çalışır {#how-ai-works}
CaseBridge yapay zekâ çıktılarını karar desteği olarak sunar. Analizler dosyadaki kayıtlara dayanır; yüzdeler ve puanlar senaryo varsayımı ya da eğitim değerlendirmesidir. Uygulama, kaynağı olmayan sonuç garantisi vermez ve çıktıların avukat tarafından doğrulanmasını ister. Yapay zekâ istekleri büronun kendi anahtarıyla yapılır.
- TODO: Hangi yapay zekâ sağlayıcı ve modellerin desteklendiği (müşteriye açıklanacak liste).

## Demo, deneme ve iletişim {#demo}
- Demo: "Demo talep et" bağlantısıyla bir görüşme planlanır: https://calendar.app.google/RL4CxQFEZAuVF2xP9
- Hesap açma: kendi kendine kayıt yoktur; büro hesabı CaseBridge ekibi tarafından açılır ve büronun ilk yöneticisi davet edilir. Kullanıcılar app.casebridge.com.tr adresinden giriş yapar.
- TODO: Ücretsiz deneme olup olmadığı, süresi ve koşulları.
- TODO: Fiyatlandırma ve paketler (sitede fiyat yok; kedi fiyat söylemez).
- TODO: İletişim e-posta adresi veya telefon (sitede yalnız demo bağlantısı var).
- TODO: Desteklenen tarayıcılar, mobil uygulama ve UYAP veya başka sistemlerle entegrasyon (sitede belirtilmiyor; kedi iddia etmez).

## Ekip {#team}
CaseBridge'i yapay zekâ, yazılım mühendisliği ve hukuk deneyimini bir araya getiren bir ekip geliştiriyor: İzzet Ahmet (iş geliştirme ve iş ortaklıkları), Emin Merden (yapay zekâ ve veri), Hatice Çam (yazılım altyapısı ve sistem mimarisi), Bengü Özbek (ekosistem ilişkileri) ve Ahmet Büyükdağ (hukuki içerik ve ürün danışmanlığı).

## Sık sorulanlar {#faq}
- CaseBridge dava sonucunu kesin tahmin eder mi? Hayır. Dosyadaki bilgilere dayanarak olası senaryolar ve bir yapay zekâ değerlendirmesi sunar; yüzdeler senaryo varsayımıdır. Nihai karar bir hukuk profesyoneline aittir.
- Geçmiş dava analizi ne işe yarar? Kapanmış dosyada güçlü ve zayıf noktaları, eksik delilleri ve farklı adımların açabileceği yolları gösterir; amaç aynı türdeki sonraki dosyada daha iyi hazırlanmaktır.
- Sitedeki örnekler gerçek mi? Hayır. Sitedeki dava, büro ve görüşme örnekleri kurgusaldır; yüzdeler ve puanlar örnek amaçlıdır.
