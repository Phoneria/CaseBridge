# Feature Specification: S09 Ürünle doğrulanmış Türkçe SSS

**Created**: 2026-11-22 | **Status**: Implemented and verified; user acceptance recorded

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ziyaretçi mevcut ürün yeteneklerini ve sınırlarını anlaşılır Türkçe cevaplarla öğrenir. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Questions map to verified product evidence and no premature feature claims.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Ziyaretçi mevcut ürün yeteneklerini ve sınırlarını anlaşılır Türkçe cevaplarla öğrenir.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: All native disclosures usable with keyboard/mobile/JavaScript disabled.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mevcut dört soru korunur; harita, karşı taraf, yönetilen duruşma, örnek mod ve teslim edilmiş ağaç için eksik konular açıklanır.
- **FR-002**: Her cevap gerçek rota/davranış/politikaya bağlanır; planlanan özellik, fiyat veya veri güvenliği hakkında doğrulanmamış vaat verilmez.
- **FR-003**: Kazanma garantisi veya kalibre edilmemiş yüzde iddiası yoktur; mobil/klavye/JS kapalı kullanım çalışır.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Questions map to verified product evidence and no premature feature claims.
- **SC-002**: All native disclosures usable with keyboard/mobile/JavaScript disabled.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.
