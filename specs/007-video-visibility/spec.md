# Feature Specification: S08 Daha görünür özgün video

**Created**: 2026-11-22 | **Status**: Approved user scope; implementation pending

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ziyaretçi mevcut video ve tema korunurken daha belirgin arka plan görür. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: Record before/after alpha and same-time captures with visible improvement and readable copy.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Ziyaretçi mevcut video ve tema korunurken daha belirgin arka plan görür.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: Video currentTime advances, reduced-motion poster and no overflow/errors.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: v.0.43 tamamlanmış başlangıç korunur; genel beyaz katmanda yalnız alpha/gradient dağılımı değişir. Son kullanıcı açıklaması ayrıca yalnız metin bloğunda daha koyu marka yazı tonu ve lokal zemin kullanımını, normal metinde 4.5:1 ve büyük başlıkta 3:1 kontrast için yetkilendirir.
- **FR-002**: Metin/CTA okunabilirliği birkaç açık/koyu karede, mobil/masaüstü ve posterde korunur.
- **FR-003**: Özgün oynatma, sessiz döngü, ekran dışı durdurma ve hareket azaltma bozulmaz.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Record before/after alpha and same-time captures with visible improvement and readable copy.
- **SC-002**: Video currentTime advances, reduced-motion poster and no overflow/errors.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.

## Clarifications

- 2026-11-22: Kullanıcı, video görünürlüğü ile okunabilirliğin birlikte kabul edilmesini istedi; genel videoyu yeniden örtmeden daha koyu logo mavisi veya dar/lokal metin zemini gibi asgari kontrast düzeltmelerine açıkça izin verdi. Normal metin 4.5:1, büyük başlık 3:1 ayrı değerlendirilir.
