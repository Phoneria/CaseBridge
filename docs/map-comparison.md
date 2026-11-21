# Bilgi Haritası ve olasılık ağacı kaynak karşılaştırması

İncelenen Emin kaynağı `134e881f0474dadc74e5ea7ad38e12f613693156` (`origin/emin`, uygulama etiketi v.0.8); başlangıç main `fdf73330d5f84effb36afe883ffd1f585cad1c13` (v.0.19). Emin commit’i main’in atasıdır. Yeni uygulama v.0.20’dir. Branch’in son commit tarihinden daha yeni, paylaşılmamış bir Emin prototipi bu incelemede doğrulanmış sayılmaz.

| Kaynak | Her iki başlangıçta Git blob | Sonuç |
| --- | --- | --- |
| `frontend/src/components/lab/MapView.tsx` | `9d9e173d59495b5f5f8f71d83037e982017cbf8e` | Aynı |
| `frontend/src/lib/graphLayout.ts` | `e2316169323c7caa627acb1e3743664b7dc5556f` | Aynı |
| `backend/app/legal_lab/graph.py` | `923228dc88e9b3a86dafb0bbc19ff5f9419ba10f` | Aynı |
| `backend/app/legal_lab/legal_graph.json` | `b49f18d97b18073cca70c13a7b739d017ac40df7` | Aynı |

Harita dosya kimliği/olay özeti almıyor: 5.637 karar, 180 madde ve 134 ilişki içeren statik kanun/Yargıtay atıf verisini gösteriyor. Dosyaya özel başarı olasılığı ağacı bu kaynaklarda yoktur. Ayrı yeni `/ai/olasilik` görünümü mevcut dosya kayıtları ve tamamlanmış analizi okur; haritanın bozulma/atıf oranlarını kullanmaz ve sayısal olasılık üretmez.

Aynı sentetik kurulum, aynı tarayıcı/dependency kurulumu, 1600×1100 viewport, ayrı açık/koyu temalar, `ispat yükü` aramasıyla ilk sonuç **TMK m.6 — İspat yükü** seçildi. Harita için eşleme anahtarı bu madde ve aynı veri hash’idir; sentetik dosya haritanın girdisi değildir. Karşılaştırılan son SVG DOM/yerleşim SHA-256’sı iki tarafta da `4493acfae34853c7bdd057b812e1414eb8ce06330f4201078f8fad74934a9744` oldu. Ekranlar `docs/validation/2026-11-22/map-*.png` içindedir.

| Alan | Doğrulanan fark / karar |
| --- | --- |
| Veri, grafik yerleşimi, ilişki ağırlıkları | Başlangıç kaynakları aynı; geometri değiştirilmedi, seçili SVG birebir aynı. |
| Arama/seçme, zoom/pan, bağlantı vurgusu ve sağ panel | Aynı kaynak; seçili maddenin ilişkileri, kanun metni ve örnek kararlar korundu. Arama/seçme ve zoom gerçek tarayıcıda geçti. |
| Tema | Açık/koyu tercihi görünümü değiştirir; kaynak farkı sayılmadı. İki tema aynı viewport’ta ayrı yakalandı. |
| Uygulama kabuğu | AI erişimi header’a taşındı, Genel Bakış etiketi Türkçeleşti ve aynı PNG logo kullanıldı. Harita yerleşimine yeni davranış atfedilmedi. |
| Kaynak notu | İngilizce `PoC, descriptive stats only` açıklaması ürün kaynağında Türkçeleştirildi; TurkishLegalBench adı ve betimleyici oran/sonuç tahmini değildir uyarısı korundu. |
| Başarısız veri ve dar ekran | 503 yanıtı Türkçe hata gösterdi. 1440/768/390/320 ve iki tema matrisi `browser.json` içinde; sayfa taşması yok. |

Emin branch’inde veya main başlangıcında ayrı bir case scenario-tree API, bileşen ya da veri sözleşmesi bulunmadı. Bu nedenle yeniden kullanılabilir Bilgi Haritası korundu; olasılık ağacı ayrı özellik olarak geliştirildi. Yeni ağaç hukuk uzmanı incelemesi yapılmış bir tahmin modeli veya kalibre edilmiş olasılık sistemi diye sunulmaz.
