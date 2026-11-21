# Feature Specification: S05 Dosyaya özgü olasılık ağacı

**Created**: 2026-11-22 | **Status**: Approved user scope; implementation pending

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Kullanıcı kendi dosyasının olayları, alternatif gelişmeleri, dayanakları ve belirsizliklerini dallanan görünümde inceler. (Priority: P1)

**Why this priority**: Kullanıcının açık talebi ve mevcut iş akışını koruma gereksinimi.
**Independent Test**: 401/404 cross-bureau and malformed child rows, restricted 403; no numeric probability even score100.

**Acceptance Scenarios**:
1. **Given** yetkili kullanıcı ve doğrulanmış başlangıç, **When** bu işin akışı kullanılır, **Then** Kullanıcı kendi dosyasının olayları, alternatif gelişmeleri, dayanakları ve belirsizliklerini dallanan görünümde inceler.
2. **Given** sınır veya hata durumu, **When** akış tamamlanamaz, **Then** mevcut veri/erişim korunur ve eksik durum açıklanır.

### User Story 2 - Sınırlar ve erişilebilirlik (Priority: P2)

**Independent Test**: No-analysis fallback, latest completed analysis, deterministic/content-sensitive version; graph/text parity and refresh notice.
**Acceptance Scenarios**: Kullanım kısıtlı/eksik veriyle denenir; yetki, gizlilik ve yanıltmama ilkeleri korunur.

### Edge Cases

Eksik veri, yetkisiz hesap, değişmiş kaynak/sürüm, dar ekran ve başarısız doğrulama açıkça ele alınır.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Emin’de örtüşme kontrol edilir; mevcut analiz ve olay/belge yapıları yeniden kullanılır.
- **FR-002**: Yalnız oturumun bürosuna ait yetkili dosya ve ilişkili kayıtlar okunur; başka büro veya restricted hesap erişimi reddedilir.
- **FR-003**: Kök gerçek dosya bağlamını; dallar kayıtlı analiz senaryolarını veya açıkça koşullu hazırlık yollarını gösterir.
- **FR-004**: Her düğüm gerekçe, kaynak ve belirsizlik gösterir; hesaplanmamış probability null ve Hesaplanmadı etiketlidir.
- **FR-005**: Analiz skoru veya kanun bozulma oranı yüzdeye dönüştürülmez; boş/çelişkili veri ve dosya güncellemesi açıkça gösterilir.
- **FR-007**: Kullanıcının son teknik uygulama/görsel kabulü kaydedilir. Yapılmamış bağımsız hukuk uzmanı incelemesi varmış gibi sunulmaz; asistanın plan sırasında eklediği bu inceleme yeni bir yayın/tanıtım engeli olmaz. Kullanıcının açık son talimatı bu noktayı netleştirir.
- **FR-006**: Grafik ve metin alternatifi aynı içeriği verir; klavye/mobil kullanılabilir, önceki snapshot yalnız bellekte tutulur.

### Key Entities

Kullanıcı, doğrulanmış kaynak/sürüm, kabul kanıtı ve bu özelliğin gösterdiği kayıtlar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 401/404 cross-bureau and malformed child rows, restricted 403; no numeric probability even score100.
- **SC-002**: No-analysis fallback, latest completed analysis, deterministic/content-sensitive version; graph/text parity and refresh notice.
- **SC-003**: Açık kabul maddelerinin tamamında gerçek sonuç kaydı bulunur; eksik sonuç tamamlandı gösterilmez.

## Assumptions

Kapsam todo.md S01–S09 ve constitution ile sınırlıdır. Mevcut yetkiler ve kullanıcı verileri korunur. Otomatik yayın tetikleyicisi seçilmemiştir.

## Clarifications

- 2026-11-22: Kullanıcı teknik uygulamayı ve gerçek görselleri onayladı; asistanın plana eklediği bağımsız uzman incelemesi yeni canlı/tanıtım kapısı değildir. Mevcut AGENTS.md müşteri/anahtar kapıları korunur; uzman incelemesi yapılmış iddiası yoktur.
