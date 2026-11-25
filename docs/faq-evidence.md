# Türkçe SSS ürün dayanakları — v.0.44

Mevcut dört soru korunur. Yeni sekiz yanıt yalnız yürürlükteki davranışı anlatır; fiyat, saklama süresi, hukuk uzmanı onayı veya kesin sonuç vaadi eklenmez.

| Soru | Ürün/politika dayanağı |
| --- | --- |
| Sonuç tahmini / davayı güçlendirme | `SimulationResultCard.tsx`, analiz skoru uyarısı; `AIAnalysis` olası senaryolar/eksikler/adımlar |
| Analiz ve duruşma farkı / hedef kullanıcı | `AiHubView.tsx`, `/ai/analiz`, `/ai/durusma`; mevcut ürün metni |
| AI menüsü | `AiNavigation.tsx`, `aiNavigation.ts`; platform/kısıtlı hesaplar hariç |
| Bilgi Haritası | `MapView.tsx`, `legal_graph.json`, `docs/map-comparison.md`; betimleyici oranlar |
| Olasılık Ağacı / yenileme | `scenario_tree.py`, `ScenarioTreeView.tsx`, `test_scenario_tree.py`; sayısal tahmin yok, değişen kayıtlar ve bellekte önceki görüntü |
| Karşı taraf analizi | `CounterAnalysisView.tsx`, `/legal-lab/counter`; verilen özet ve seçili taraf |
| Yönetilen duruşma | `DirectedTrialView.tsx`, `/legal-lab/trial/*`; dosya özetinden aşamalı prova |
| Örnek mod | `MockProvider`, `AiStatusIndicator.tsx`; örnek/eğitim etiketi korunur |
| Çıktı doğrulama | Uygulama analiz ve eğitim uyarıları; constitution IV; kaynaksız sonuç garantisi yok |

Doğrulama: teknik yanıtlar uygulama kaynakları ve sentetik akışlarla karşılaştırılır. Dış hukuk uzmanının incelemesi bu teknik kontrolle yapılmış sayılmaz; varsa kalan inceleme todo.md içinde açık tutulur.
