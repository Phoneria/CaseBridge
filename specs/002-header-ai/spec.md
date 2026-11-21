# Feature Specification: S03 Header yapay zekâ gezinmesi

**Created**: 2026-11-22 | **Status**: Approved user scope; implementation pending

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Yetkili kullanıcı AI araçlarına masaüstü ve mobil header üzerinden erişir. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Exercise all role states and deep routes; no duplicate sidebar AI links.

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

- **FR-001**: Hub ve tüm mevcut AI rotaları yalnız header’da bulunur; sidebar AI grubu kaldırılır.
- **FR-002**: Platform ve restricted hesapların mevcut sınırları korunur; görünüm server yetkilerini genişletmez.
- **FR-003**: Aktif alt rota, görünür klavye odağı, Escape ve odağın açan düğmeye iadesi çalışır.
- **FR-004**: 320px dâhil mobilde header menüsünden aynı araçlara erişilir; arama/bildirim/kullanıcı menüsü korunur.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Exercise all role states and deep routes; no duplicate sidebar AI links.
- **SC-002**: Keyboard open, Tab, Escape/focus return and mobile pointer navigation in both themes.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.
