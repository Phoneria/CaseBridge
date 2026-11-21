# Feature Specification: S07 Güncel gerçek ürün görselleri

**Created**: 2026-11-22 | **Status**: Implemented and verified; user acceptance recorded

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ziyaretçi tanıtımda güncel çalışan uygulamanın doğru Türkçe ekranlarını görür. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Every tab and dialog opens corresponding current native capture.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Ziyaretçi tanıtımda güncel çalışan uygulamanın doğru Türkçe ekranlarını görür.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: Desktop/mobile decoding/geometry and synthetic-data/provenance checks.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Her ürün sekmesi gerçek rota, kaynak sürüm ve sentetik örnek ile eşleşir.
- **FR-002**: S03/S04/S05/S06 sonrası mevcut kabul edilmiş görünüm doğrudan yakalanır; sahte veya üstüne yazı eklenmiş UI yoktur.
- **FR-003**: Örnek mod açıklamaları, alt metin ve tam ekran bağlantısı korunur; gerçek müşteri verisi/sır kullanılmaz.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every tab and dialog opens corresponding current native capture.
- **SC-002**: Desktop/mobile decoding/geometry and synthetic-data/provenance checks.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.
