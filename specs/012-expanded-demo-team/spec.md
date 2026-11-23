# Feature Specification: Geniş örnek avukat ekibi
## User Scenarios
### US1 (P1) — Anlamlı örnek ekip
Büro yöneticisi Örnek verileri yükle ile 12 ayrı kurgusal avukat ve aralarında dağıtılmış örnek dava portföyü görür. Admin Paneli grafiği ve atama panosu tüm isimleri okunur gösterir.
Acceptance: sıfır avukatlı büroda bile 12 örnek avukat; her birinin en az bir örnek davası; dropdown ve grafikte görünür.
### US2 (P1) — Güvenli tekrar yükleme
Önceki şablonu yüklemiş yönetici aynı düğmeyle ekibi genişletir. Eski örnek davalar bir defa dağıtılır; sonraki yüklemelerde manuel yeni atamalar korunur. Gerçek kullanıcı/dava ve diğer bürolar değişmez.
Acceptance: tekrar yükleme kopya üretmez; örnek ekip gerçek davaya atanamaz, gerçek veri kapsamı kazanmaz; otomatik davet/sağlayıcı çağrısı yok.
### Functional Requirements
- **FR-001**: Şablon 12 sabit, farklı isim ve uzmanlık içeren açıkça ÖRNEK etiketli avukat oluşturur; yeni ve eski örnek portföyü dağıtır.
- **FR-002**: Ekip yalnız kendi bürosunun örnek dosyalarına erişimle sınırlıdır; ortak şifre/otomatik davet yok. Gerçek dosyaya veya diğer büroya örnek kullanıcı ataması reddedilir; mevcut genel erişim kuralları korunur.
- **FR-003**: Tekrar yükleme kullanıcı/dava kopyası oluşturmaz, ilk dağıtım sonrası manuel atamayı değiştirmez; gerçek kayıt, bütçe ve kimlik bilgilerini değiştirmez. Aynı büro ithalatı mevcut kilit ve transaction içinde kalır.
- **FR-004**: Atama listesi örnek avukatları yalnız örnek dosyalarda sunar. İş yükü grafiğinde tüm 12 isim görünür, mobilde pano yatay kaydırılır; Ayarlar açıklaması 12 avukatı belirtir.
- **FR-005**: Hedefli izolasyon/idempotence/atama testleri, frontend ve tarayıcı kontrolleri gerçek sonuçla kaydedilir; v. sürümü güncellenir; ayrı PR In Review bırakılır, yayın veya merge yapılmaz.
- **FR-006**: Yönetici Örnek verileri kaldır ile salt okunur sayım önizlemesi, Vazgeç ve açık kalıcı kaldırma onayı görür. Örnek dosyaların bağlı/sonradan eklenen içeriği de kaldırılacağı açıklanır. Güncel sayım değişirse yeniden onay gerekir; çift tıklama engellenir.
- **FR-007**: Kaldırma yalnız oturum bürosundaki işaretli bilinen örnek davaları ve kesin şablon kimliklerini kapsar; gerçek/diğer büro kayıtları, profil, bütçe ve anahtarlar korunur. Başka kayıtta kullanılan örnek hesaplar korunur; kapsam daraltılarak genel erişime dönüşmez. Dosyalar yalnız commit sonrası, storage sınırı ve başka kayıt referansı kontrolüyle temizlenir. Tekrar kaldırma güvenli, yeniden yükleme çalışır.
## Success Criteria
12 örnek avukatın tamamı örnek dosya sahibi; tek ve çift import aynı kişi sayısı; manuel atama tekrar importta korunur. Gerçek/diğer-büro atamaları reddedilir. 1440/390/320px iki temada tüm isimler ve atama kontrolleri erişilebilir.
## Edge cases and assumptions
Kullanıcının “çok daha fazla” isteği için 12 seçildi. Önceki örnek davalar yalnız açık şablon işareti ve beklenen dava numarası birlikte eşleşirse taşınır. Çakışma tüm işlemi geri alır. Daha önce devre dışı bırakılan örnek hesap tekrar etkinleştirilmez. Örnek şablonun ilk genişletme dağıtımı kullanıcı talimatının kapsamındadır; gerçek dosyalar kapsam dışıdır.
