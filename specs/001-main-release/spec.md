# Feature Specification: S02 Main kaynaklı değişmez yayın

**Created**: 2026-11-22 | **Status**: Implemented and verified; user acceptance recorded

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operatör yalnız main kaynaklı doğrulanmış sürümü etkinleştirir; olağan hesap canlı kodu düzenleyemez. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Reject non-main source and path/manifest tampering without changing active services.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Operatör yalnız main kaynaklı doğrulanmış sürümü etkinleştirir; olağan hesap canlı kodu düzenleyemez.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: Demonstrate denied code writes for ordinary account/runtime, retained admin access and successful verified rollback.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Her yeni yayın main’den seçilmiş tam commit’e bağlanır; temiz artefakt, sürüm ve hash/digest kaydı taşır.
- **FR-002**: Olağan hesap kod yazamaz veya serbest Docker/root komutu çalıştıramaz; mevcut yönetici kurtarma erişimi korunur.
- **FR-003**: Sırlar/veri artefakttan ayrıdır; etkinleştirme ve önceki doğrulanmış sürüme geri alma public kod/health kontrolüyle sonuçlanır.
- **FR-004**: Yayın tetikleme zamanı kullanıcı seçimi olmadan otomatikleştirilmez.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reject non-main source and path/manifest tampering without changing active services.
- **SC-002**: Demonstrate denied code writes for ordinary account/runtime, retained admin access and successful verified rollback.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.
