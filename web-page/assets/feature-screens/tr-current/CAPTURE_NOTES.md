# Güncel public ürün ekranları — 22 Kasım 2026, tanıtım v.0.47

Bu 12 JPEG doğrudan **public uygulama v.0.23** frontend’inden alınmıştır: https://app.casebridge.com.tr . Sunulan kaynak commit’i `f625960cadd4e4c29985fa26fcb4914d4ff326b3`, uygulama fingerprint’i `7aa7c3089e82c3737f9c7b1a28b8a36a4d0a596f571be05c4e610f4b4bf4cd24`. Yakalama öncesi ve sonrası release.json aynıdır. Önceki v.0.22 görselleri değiştirilmiştir; eski kayıtlar Git tarihçesinde ve önceki provenance dosyalarında kalır.

- Public JS/CSS ve gerçek Türkçe uygulama görünümü kullanılır. Yerel frontend çizimi, sahte UI, üstüne metin boyama, ekran birleştirme veya görüntü düzenleme yoktur.
- Public frontend’in tüm `/api/**` tarayıcı istekleri yalıtılmış localhost:8044 sentetik SQLite seed/template backend’e yönlendirilmiştir. Üretim oturumu/hesabı/bürosu kullanılmaz; üretim API’sine bu istekler iletilmez. Örnek kimlikler ve veriler kurgusaldır. Provider mock’tur; gerçek API/encryption key veya dış AI çağrısı yoktur. Test JWT’si yalnız geçici browser context içindedir, audit/Git’e yazılmaz.
- Mevcut `scripts/capture-product.cjs` turu public origin ve sentetik API proxy ile kullanılmıştır. Hedef dosyalar doğrudan Playwright `page.screenshot` çıktılarıdır; açık tema ve gerçek ürün davranışı. v.0.23’ün şeffaf görünen özgün logosu, eski mavi AI kutusu ve dengeli sidebar her karede denetlenmiştir. Yeni alpha logo dosyası üretilmemiştir.
- Büyütme görüntülenen JPEG’in aynısını açar. Olasılık Ağacı tek ve ilk/varsayılan paneldir; analiz ikinci, kalan sıralama korunur. Demo tahmini/örnek mod etiketleri gerçek kaynak metnidir; gerçek dava kazanma tahmini veya kalibrasyon sayılmaz.
- Rota/viewport/SHA-256/önceki hash ve marka gözlemleri: `docs/validation/2026-11-22/public-gallery-provenance.json`. Public görsel hash/sürüm/health ve galeri davranışı yayın sonrasında `specs/006-product-captures/verification.md` içinde kaydedilir; yakalama tek başına yayın kanıtı değildir.

| Dosya | Gerçek public uygulama rotası (sentetik veriler) | Viewport |
| --- | --- | --- |
| analysis.jpg | `/davalar/4d383cd4-0975-4b5f-8497-05b7ef7d3f5b?sekme=ai` | 1600×1100 |
| evaluation.jpg | `/ai/durusma/oturum/243c7f1f-91fb-5a3c-8d24-f9f0e7d8f2b3` | 1600×1100 |
| conversation.jpg | `/ai/durusma/oturum/243c7f1f-91fb-5a3c-8d24-f9f0e7d8f2b3` | 1600×1100 |
| evidence.jpg | `/ai/durusma/oturum/243c7f1f-91fb-5a3c-8d24-f9f0e7d8f2b3` | 1600×1100 |
| assistant.jpg | `/ai/sohbet?sohbet=9392f8e6-ac86-5cf6-9b2e-b373676aed31` | 1600×1100 |
| case-documents.jpg | `/davalar/4d383cd4-0975-4b5f-8497-05b7ef7d3f5b` | 1600×1100 |
| calendar.jpg | `/takvim` | 1600×1100 |
| reports.jpg | `/raporlar` | 1600×1100 |
| knowledge-map.jpg | `/ai/harita` | 1600×1100 |
| counter-analysis.jpg | `/ai/karsi-taraf` | 1600×1100 |
| directed-trial.jpg | `/ai/yonetmen` | 1600×1100 |
| scenario-tree.jpg | `/ai/olasilik?ornek=belge-dogrulama` | 1600×1400 |

Normal galeri URL’leri ve büyütme bağlantıları aynı `?v=0.47` yayın anahtarını taşır; tekrar kullanılan conversation/evaluation görselleri de aynı anahtarı kullanır. Anahtar sayfa kaynağındadır; ziyaretçi veya denetleyici elle query eklemez. Hash JPEG baytlarınındır. Önce/sonra ısıtılmış browser cache ve normal reload ayrıca sınanır.
