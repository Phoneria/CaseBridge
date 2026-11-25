# Feature Specification: S03 Header yapay zekâ gezinmesi

**Created**: 2026-11-22 | **Status**: Implemented and verified; user acceptance recorded

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Yetkili kullanıcı AI araçlarına masaüstü ve mobil header üzerinden erişir. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Exercise all role states and deep routes; header and expanded sidebar offer the same authorized tools.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Yetkili kullanıcı AI araçlarına masaüstü ve mobil header üzerinden erişir.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: Keyboard open, Tab, Escape/focus return and mobile pointer navigation in both themes.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Son kullanıcı yönlendirmesi: hub ve tüm mevcut AI rotaları header’da korunur; aynı yetkili araçlar sidebar’da genişletilmiş, ek tıklama gerektirmeyen ayrı CaseBridge AI grubunda da bulunur. Tek sütun ve tüm satırlar görünür; parlak mavi tüm-grup halkası yoktur.
- **FR-002**: Platform ve restricted hesapların mevcut sınırları korunur; görünüm server yetkilerini genişletmez.
- **FR-003**: Aktif alt rota, görünür klavye odağı, Escape ve odağın açan düğmeye iadesi çalışır.
- **FR-004**: 320px dâhil mobilde header menüsünden aynı araçlara erişilir; arama/bildirim/kullanıcı menüsü korunur.

- **FR-007**: Yayın regresyonunda hızlı sesli beyan, conversation modunda ilk render’daki eski opening değerini göndermez; geçerli seçilmiş konuşma eylemi korunur, varsayılan argument olur.

- **FR-005**: Tam yetkili menü 768/900/1080px masaüstü yüksekliğinde ilk/son bağlantı ve dokuz AI satırı tek bakışta görünür; logo üstte ve Ayarlar altta, aradaki satırlar kullanılabilir yüksekliği orantılı doldurur ve uzun ekranda büyük boşluk bırakmaz; kısa/mobil/yüksek zoom alanında kesilmeden kaydırılabilir. Tek seçili AI bağlantısı, klavye odağı ve rol sınırları korunur.

- **FR-006**: Önceki b640c54 kaynaklı normal koyu/mavi CaseBridge AI paneli ve ayrı alt seçenek satırları geri gelir; sürekli açık tek sütun ve normal 256px genişlik korunur.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Exercise all role states and deep routes; header and expanded sidebar offer the same authorized tools.
- **SC-002**: Keyboard open, Tab, Escape/focus return and mobile pointer navigation in both themes.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.

- **FR-008**: Büro AI menüsü Sufle, Canlı Duruşma ve Karşı Taraf Analizi, Hukuk Asistanı, Olasılık Ağacı ve Bilgi Haritası girişlerinden oluşur. Her birleşik alanda iki araç arasında geçilir. AI genel bakış kaldırılır. Dosya Analizi ve Yönetilen Duruşma yalnız seçili dava içinde açılır. Dava detayındaki CaseBridge AI sekmesi diğer araçlara da erişim sağlar. Eski bağlantılar dosya kimliği varsa korur. Bu menü FR-001/005'teki eski dokuz satırın yerini alır.
