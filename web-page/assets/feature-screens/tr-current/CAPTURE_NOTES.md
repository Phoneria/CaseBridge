# Gerçek ürün ekranları — 22 Kasım 2026, tanıtım v.0.44

Bu dizindeki 12 JPEG, aynı v.0.20 uygulamasının **production build** sürümünden doğrudan alındı. UI çizimi, görüntü üzerinde çeviri/boyama, birleştirme veya önizlemeye özel kaynak override yoktur. Kaynak fingerprint’i `13f7c8352023418a05f6a44ee864781df8bdcd483ca68f8f7ed02ee97f1a758d`; bu manifest `frontend/app-version.json` içindedir. Yakalama sonrası app kaynakları değişmezse main sürümüyle aynı davranış ve görünüm korunur. Main/public commit kaydı yayın doğrulamasında ayrıca tutulur.

- Kaynak: temiz `codex/spec-driven-rollout` çalışma ağacı; uygulama v.0.20. `next build` + `next start` (yerel 3044); API yerel 8044.
- Dil: gerçek Türkçe ürün metinleri. Genel Bakış, rapor/değerlendirme metinleri ve duruşma tutanak türleri ürün kaynağında Türkçeleştirildi. CaseBridge AI marka adıdır; Enter/Shift tuş adlarıdır.
- Tema: ürünün açık tema tercihi; viewport 1600×1100. Yeni ağaç örneği 1600×1400.
- Veri: bu görev için sıfırdan oluşturulmuş `/tmp/casebridge-spec-validation/demo.db`, mevcut demo seed ve büroya örnek şablon ekleme işlevi. Kişiler, şirketler, dosyalar, analiz ve sohbet içerikleri kurgusaldır. Gerçek müşteri verisi, üretim DB’si, gerçek API anahtarı veya dış sağlayıcı çağrısı yoktur.
- Analiz örnekleri `demo-template / fictional-presentation`; çalışma araçları `LLM_PROVIDER=mock`, `CHAT_PROVIDER=mock`. Örnek/eğitim açıklamaları korunur. Eğitim puanı 74/100’dür; analiz değerlendirme puanı kaynak verideki 70 olarak korunur. Hiçbiri kazanma olasılığı sayılmaz; ağaçta sayısal olasılık yoktur.
- `scripts/capture-product.cjs` yalnız açık sentetik veri onayıyla çalışır; auth token yalnız tarayıcı belleği/test localStorage oturumunda kullanılır, audit’e veya depoya yazılmaz. `docs/validation/2026-11-22/product-captures.json` rota, viewport ve dosya SHA-256 eşlemesini tutar.

| Dosya | Gerçek ürün rotası ve örnek |
| --- | --- |
| analysis.jpg | `/davalar/<sentetik-id>?sekme=ai`, ÖRNEK-2025/240 Ticari Alacak Davası raporu |
| conversation.jpg | `/ai/durusma/oturum/<sentetik-id>`, tamamlanmış kurgusal kira provası tutanağı |
| evidence.jpg | Aynı prova, açılmış dosya notu/deliller |
| evaluation.jpg | Aynı prova, kurgusal karar ve eğitim değerlendirmesi |
| assistant.jpg | `/ai/sohbet`, ÖRNEK · Delil ve süre kontrolü sohbeti |
| case-documents.jpg | Aynı sentetik alacak dosyası, Genel Bakış ve belge erişimi |
| calendar.jpg | `/takvim`, aynı sentetik büronun duruşma/görev takvimi |
| reports.jpg | `/raporlar`, yalnız sentetik büro analitiği |
| knowledge-map.jpg | `/ai/harita`, TMK m.6 / İspat yükü seçili; statik kanun/karar verisi, dosya tahmini değil |
| counter-analysis.jpg | `/ai/karsi-taraf`, açık kurgusal uyuşmazlık özeti ve örnek sağlayıcı yanıtı |
| directed-trial.jpg | `/ai/yonetmen`, aynı kurgusal özet ve örnek mod |
| scenario-tree.jpg | `/ai/olasilik?dava=<sentetik-id>`, aynı rapordan üç senaryo, dayanak/belirsizlik ve Hesaplanmadı etiketleri |

Kullanıcı teknik uygulamayı ve gerçek ürün görsellerini onayladı; Olasılık Ağacı 12. ürün sekmesine ve gerçek uygulama rotasına bağlandı. Bağımsız hukuk uzmanı incelemesinin yapıldığına dair iddia yoktur. Tüm 12 sekme güncel gerçek ürüne eşlenmiştir; büyütme aynı dosyayı açar.

## Son kabul ve public eşleme

Kullanıcı teknik/görsel kabulünü takiben “İncelemeyi tamamladım ve kabul ediyorum” beyanını verdi. Bağımsız audit/model kalibrasyonu asistan tarafından yapılmış diye sunulmaz. Public uygulama v.0.20 ve tanıtım v.0.44, main `70fabd06f695f03477203a3fc86291f06e3e2f7c` kaynaklıdır; 12 capture dosyasının public SHA-256 eşleşmesi ve tam ekran/mobil kullanımı doğrulandı.

İnceleme beyanının kaynağı, S05 için ayrı gönderilen soruya kullanıcının doğrudan verdiği “İncelemeyi tamamladım ve kabul ediyorum” yanıtıdır; önceki uygulamaya başlama onayıyla karıştırılmaz. Bu yalnız kullanıcı beyanı/kabulüdür. İncelemeyi yapan kişinin uzmanlığı/bağımsızlığı ve inceleme bulguları tarafımızca doğrulanmadı; bağımsız hukuki doğrulama ve model kalibrasyonu yapılmış sayılmaz. Teknik yayın tekrarlanmadı.

## v.0.21 takip görseli / tanıtım v.0.45

Yalnız scenario-tree.jpg bu takip işinde gerçek v.0.21 production build üzerinden yenilendi; diğer 11 görselin v.0.20 kaydı yukarıda korunur. Yeni rota `/ai/olasilik?ornek=belge-dogrulama`; tamamen kod sahipli sentetik fatura örneği, belge=destekleyici, ödeme=belirsiz varsayımı; 1600×1100. Dallar Demo tahmini %50,0 / %16,7 / %33,3 gösterir. Görsel doğrudan ekran kaydıdır, düzenleme/üretim katmanı yok. Hash: `00ffb6331a15b9f6bd554112376f8fa709ec75e46b5e27fa5605bae2dae5077e`. Kaynak fingerprint: `ebd9564f5bbf1821056e9f973b1b138396bfc955f5f8d34bd2de9d79adc8cea2`. Şirket/müşteri verisi veya gerçek anahtar kullanılmadı.

## v.0.22 tüm ekranlar / tanıtım v.0.46

Yeni talimatla geri gelen, açık ve kompakt sol CaseBridge AI grubunu yansıtmak için 12 ekranın tamamı aynı gerçek production build üzerinden tekrar yakalandı. Kaynak fingerprint `66eea827e716f6fc17943cf6ac253a148bdc6aec5fcdc074a6888e187646664d`; uygulama v.0.22. Standart ekranlar 1600×1100, ağaç 1600×1400. Aynı yalıtılmış sentetik SQLite seed/template, mock sağlayıcılar ve gerçek rotalar; gerçek müşteri veya sır yok, görsele ek metin/override yok. Rota/viewport/SHA-256 kaydı `docs/validation/2026-11-22/sidebar-capture-provenance.json`. Önceki v.0.20/v.0.21 kayıtları tarihçedir; güncel 12 görsel bu v.0.22 kaydına bağlıdır. Ürün bölümünde aynı ağaç sekmesi ilk/varsayılan, analiz ikinci; kimlikler ve diğer sıra korunur.
