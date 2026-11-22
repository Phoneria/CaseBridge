# Feature Specification: Güncel ekip ve sorumluluklar

**Branch**: codex/team-emin | **Created**: 2026-11-22 | **Status**: Approved user scope

## User Scenarios & Testing

### User Story 1 - Ziyaretçi beş ekip üyesinin katkısını öğrenir (P1)
Emin Merden ekibe eklenir. İzzet iş geliştirmeden, Emin yapay zekâ ve veriden sorumludur. Diğer üyelerin ilgili katkıları korunur.
**Acceptance**: Beş isim bir kez görünür; roller çakışmaz; Emin'in kısa Türkçe biyografisi verilen özgeçmişteki mesleki deneyimle sınırlıdır.

### User Story 2 - Her ziyaretçi aynı doğru metne erişir (P2)
**Acceptance**: Masaüstü, mobil, erişilebilir adlar ve JavaScript kapalı görünüm aynı isimleri/rolleri sunar. Eski rolü yeniden yazan çalışan başka görünüm bulunmaz.

### Edge Cases
Fotoğraf sağlanmadı: gerçek portre izlenimi vermeyen dekoratif baş harfler kullanılır. PDF ve iletişim bilgileri yayımlanmaz. Sürüm yarışı varsa güncel main yeniden değerlendirilir; Rehber işi bu PR'a alınmaz.

## Requirements
### Functional Requirements
- **FR-001**: Emin Merden, Yapay zekâ ve veri rolü ve BAUROV/Baykar/Outlier AI deneyiminden doğru kısa Türkçe tanıtımla mevcut ekip yerleşimine eklenir; ham CV veya özel iletişim bilgileri yayımlanmaz.
- **FR-002**: İzzet Ahmet iş geliştirme ve iş ortaklıklarından sorumlu gösterilir; Bengü Özbek'in ilgili katkısı ekosistem ilişkileri olarak netleştirilir; Hatice Çam ve Ahmet Büyükdağ'ın içerikleri korunur.
- **FR-003**: Gerçek sunulan tüm ekip görünümlerinde, JS kapalı, masaüstü/mobil ve erişilebilir metinde aynı bilgiler bulunur; mevcut tema ve bağlantılar korunur.
- **FR-004**: Ayrı marketing sürümü korumalı main ve mevcut immutable otomatik VPS akışından yayımlanır; normal public URL'de yeni metin/kod/sürüm ve health doğrulanmadan tamamlanmış sayılmaz.

## Success Criteria
- **SC-001**: Beş üyenin adı ve tekil sorumlulukları normal sayfadan okunur.
- **SC-002**: 1440/390/320 genişliklerinde JS açık/kapalı toplam altı görünümde ekip metni eksiksiz ve taşmasızdır.
- **SC-003**: Public sürüm ve yayımlanan ekip metni doğrulanır; özel iletişim/PDF yayımlanmaz.

## Assumptions
Kullanıcı görev dağılımını ve özgeçmişten mesleki tanıtımı açıkça yetkilendirdi. Yeni müşteri teslimi, ürün veya credential değişikliği yoktur.
