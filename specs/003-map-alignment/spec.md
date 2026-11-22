# Feature Specification: S04 Emin Bilgi Haritası uyumu

**Created**: 2026-11-22 | **Status**: Implemented and verified; user acceptance recorded

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Kullanıcı karşılaştırılabilir koşullarda Emin’in mevcut Bilgi Haritasını görür. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Record identical source/blob evidence and same-sample rendering.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Kullanıcı karşılaştırılabilir koşullarda Emin’in mevcut Bilgi Haritasını görür.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: Verify selection/details/zoom and descriptive note on desktop/mobile.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Emin ve main commit/veri sürümleri kanıtla karşılaştırılır; eşitlik veya fark açıkça kaydedilir.
- **FR-002**: Aynı tema, viewport, seçili madde ve veri kullanılır; statik harita dosyaya özgü tahmin diye sunulmaz.
- **FR-003**: Arama/seçim/bağ ve detaylar korunur; yüzdelerin betimleyici niteliği ve veri kaynağı görünür kalır.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Record identical source/blob evidence and same-sample rendering.
- **SC-002**: Verify selection/details/zoom and descriptive note on desktop/mobile.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.
