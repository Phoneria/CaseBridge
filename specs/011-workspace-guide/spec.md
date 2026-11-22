# Feature Specification: Etkileşimli çalışma alanı rehberi

## User Scenarios
### US1 — Bul ve öğren (P1)
Oturum açmış kullanıcı masaüstü ve mobil header sağ üstündeki “Rehber” ile bulunduğu bölüme uygun konuya ulaşır. Konu seçer, adımları ileri/geri okur ve çıkar. Okuma uygulamada işlem başlatmaz.
Acceptance: /buro?tab=deadline kritik süreyi açar; konu değişimi ilk adıma döner; çıkış odağı girişe taşır.
### US2 — Büro operasyonları (P1)
Büro yöneticisi günlük öncelik, kritik süre, devir/teslim, inceleme/onay ve müvekkil paylaşımı akışlarını gerçek alan ve durum adlarıyla öğrenir. Diğer yönetim sekmeleri de konu olarak bulunur.
Acceptance: doğrulama/hatırlatma sınırı, açık iş devri ve teslim teyidi, sabit inceleme sürümü, açık yayın/alıcı seçimi açıklanır.
### US3 — Rol ve erişilen bölüm (P1)
Avukat, kısıtlı hesap ve platform yöneticisi yalnız kendi erişimine uygun konuları görür. Diğer ana bölümler için pratik rehber vardır.
Acceptance: platform/kısıtlı hesaplarda büro veya AI konusu yok; avukatta yönetici işlemleri yok; muhasebe ve müvekkil anlatımı kendi kapsamına uyar.
### Edge cases
Bilinmeyen yol/sekme ilk yetkili konuya döner. Eksik kullanıcı için giriş gösterilmez. Sayfa veya hesap değişimi rehberi kapatır. Uzun konu ve küçük ekran kaydırılabilir; Escape, Tab ve Shift+Tab çalışır.

### Functional Requirements
- **FR-001**: Header sağ üstünde masaüstü/mobil görünür metin tam “Rehber”; kullanıcının 22 Kasım ekranlı düzeltmesiyle header CaseBridge AI düğmesinin yerini alır; tıklamak doğrudan etkileşimli rehberi açar. AI araçları sol menüde, kullanıcı menüsü header’da kalır.
- **FR-002**: Güncel yol ve büro sekmesine uygun başlangıç, konu seçimi, numaralı ilerleme, ileri/geri, yeniden başlama ve çıkış sağlanır.
- **FR-003**: Büro Yönetimi sekmelerini kapsayan detaylı Türkçe iş akışları kaynakta doğrulanır; kritik süre, devir, onay, müvekkil yayını ayrıntılıdır.
- **FR-004**: Konular oturum rolüne göre filtrelenir; platform ve kısıtlı hesap sınırları korunur. Diğer ana bölümler erişime uygun anlatılır.
- **FR-005**: Rehberin açılması/okunması veri yazmaz, sağlayıcı çağırmaz, sayfa değiştirmez; sır veya özel kayıt içermez, ilerleme yalnız bellektedir.
- **FR-006**: Klavye odağı, Escape/Tab döngüsü, mobil taşma/kaydırma ve açık/koyu temalar doğrulanır.
- **FR-007**: Davranış sürümü v.0.24 hazırlanır; gerçek kabul testleri Spec Kit kapısına bağlanır; PR In Review bırakılır, merge/deploy yapılmaz.

## Success Criteria
- SC-001: 320/390/1440px iki temada giriş görünür, rehber okunur, yatay taşma yok.
- SC-002: Her yetkili ana bölüm ve tüm 17 büro sekmesi konuya eşleşir; platform/kısıtlı/avukat olumsuz kapsam kontrolleri geçer.
- SC-003: Rehberin tüm kontrolleri klavyeyle çalışır; okuma süresince sıfır ağ isteği ve sıfır uygulama yazımı oluşur.

## Assumptions
Bu bir öğretici okuma panelidir; rehber adımı tamamlamak gerçek işi tamamlamak anlamına gelmez. Yerel sentetik UI doğrulaması üretim yayını değildir.

## Clarification — 22 November 2026
Kullanıcı ekran görüntüsüyle açıkça “sağ üstte Casebridge AI yerine Rehber” istedi. Önceki header AI korunur varsayımı bu istek için geçersizdir. Constitution VI ve specs/002-header-ai header yerleşim kuralına kullanıcı tarafından açıkça yetkilendirilmiş dar istisna: yalnız header AI girişi kaldırılır; sidebar araçları, roller ve oturum sınırları korunur.
