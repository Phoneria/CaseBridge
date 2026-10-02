# Otomatik AI Seviyeleri (Sohbet + Dosya Analizi + Canlı Duruşma) — Tasarım

- **Tarih:** 2026-10-02
- **Dal:** `feature/ai-chat`
- **Durum:** Onaylandı
- **Değiştirdiği tasarım:** `2026-10-02-chat-levels-design.md` (kullanıcının seviye seçtiği sürüm). Seviye altyapısı (seviye → model, token tavanı, geçmiş, ek talimat; `level` sütunu; export) korunur, yalnızca seviyeye kimin karar verdiği değişir.

## 1. Amaç

AI seviyesini kullanıcı seçmesin; sistem arka planda seçsin. Üç seviye (Basit / Standart / Kapsamlı) yalnızca sohbette değil, Dosya Analizi ve Canlı Duruşma'nın kullandığı `LLM_PROVIDER` tarafında da olsun. Hedef: basit işlerde daha ucuz model, önemli adımlarda daha güçlü model.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Sohbette seviye | Her soru önce Basit seviyenin modeline sınıflandırılır (`basic`/`standard`/`deep`). Hata, zaman aşımı veya anlaşılmaz yanıt → `standard`. |
| Kapatma | `CHAT_AUTO_LEVEL=false` → sınıflandırma yapılmaz, her soru `standard`. |
| Analiz/Duruşma'da seviye | Görev türüne göre sabit tablo (sınıflandırma çağrısı yok). |
| Ayarlar | Ayrı kalır: sohbet `CHAT_*`, analiz/duruşma `LLM_*`. |
| Analiz/Duruşma token tavanı | Yok (JSON yarıda kesilmesin). Tasarruf yalnızca model seçiminden. |
| Arayüz | Seviye seçici kaldırılır. Yanıt altındaki "Seviye · model" etiketi kalır. |

## 3. Sohbet

### 3.1 Sınıflandırıcı (`app/ai/chat/classifier.py`)

- `classify_level(provider, question, previous_question=None) -> str`.
  - Sistem talimatı: soruyu üç seviyeden birine ayır ve yalnızca `basic`, `standard` veya `deep` yaz.
    - `basic`: tek bir kavram, tanım, süre, sayı veya evet/hayır; birkaç cümleyle yanıtlanabilir.
    - `deep`: çok adımlı hukuki analiz, birden fazla kanun veya görüşün karşılaştırılması, somut olay değerlendirmesi, dilekçe/sözleşme taslağı.
    - `standard`: diğer her şey.
  - Kullanıcı mesajı: varsa önceki kullanıcı sorusu (bağlam için) ve yeni soru.
  - Yanıt ayrıştırma: büyük/küçük harf ve boşluk önemsiz; ilk geçen `basic|standard|deep` (Türkçe `basit|standart|kapsamlı` da kabul) kelimesi alınır. Bulunamazsa `standard`.
  - Sağlayıcı hatası, zaman aşımı veya beklenmeyen istisna → `standard` (loglanır, içerik loglanmaz).
- Sınıflandırma sağlayıcısı: Basit seviyenin modeli, `max_tokens=16`, zaman aşımı `CHAT_CLASSIFIER_TIMEOUT_SECONDS` (varsayılan 8).
- Yeni ayarlar: `CHAT_AUTO_LEVEL` (varsayılan `true`), `CHAT_CLASSIFIER_TIMEOUT_SECONDS` (varsayılan `8`, pozitif).

### 3.2 Gönderme akışı

1. Sohbet sahipliği kontrol edilir (404).
2. Seviye belirlenir: `CHAT_AUTO_LEVEL` kapalıysa `standard`; açıksa sınıflandırıcı (yeni soru + sohbetteki son kullanıcı sorusu). Sınıflandırıcı overridable bir bağımlılıktır (`get_chat_level_classifier`).
3. Seviyenin sağlayıcısı alınır; yapılandırma hatası → 503, hiçbir şey kaydedilmez.
4. Bundan sonrası değişmez: kullanıcı mesajı, `model` + `level` ile asistan yer tutucusu, seviyenin geçmiş sınırı ve talimatı, akış, kesilme işareti.

- İstek gövdesindeki `level` alanı kaldırılır; gönderilirse yok sayılır.
- `/chat/status` yanıtından `levels` listesi kaldırılır.
- Export (`?level=` dahil) ve `truncated` davranışı aynen kalır.

## 4. Dosya Analizi ve Canlı Duruşma

### 4.1 Görev → seviye tablosu (`app/ai/llm_levels.py`)

| Görev anahtarı | Seviye |
|---|---|
| `analysis.research` | standard |
| `analysis.plaintiff` | standard |
| `analysis.defendant` | standard |
| `analysis.judge` | deep |
| `courtroom.opponent` | standard |
| `courtroom.judge_interim` | basic |
| `courtroom.judge_final` | deep |
| `courtroom.json_repair` | basic |

### 4.2 Ayarlar ve sağlayıcı

- Yeni ayarlar: `LLM_MODEL_BASIC`, `LLM_MODEL_DEEP` (varsayılan boş).
- Standart model = sağlayıcının bugünkü modeli (`OPENAI_MODEL`, `OLLAMA_MODEL` veya `QWEN_MODEL`). Seviye modeli boşsa Standart model kullanılır → mevcut `.env` ile davranış değişmez.
- `get_llm_provider()` gerçek sağlayıcılarda bir `LevelRoutedProvider` döndürür:
  - `for_task(task) -> LLMProvider`: görevin seviyesine ait modelle kurulmuş alt sağlayıcı (model başına bir kez oluşturulur ve önbelleğe alınır).
  - Kendisi de `LLMProvider`'dır: doğrudan `complete()` Standart modelle çalışır.
  - `last_usage` / `last_latency_ms` son kullanılan alt sağlayıcınınkini yansıtır.
- Mock modda (`LLM_PROVIDER=mock`) yönlendirme yok; bugünkü mock sağlayıcılar aynen kalır.
- Çağrı noktaları `provider_for(provider, task)` yardımcısını kullanır: sağlayıcının `for_task`'ı varsa onu, yoksa sağlayıcının kendisini döndürür (testlerdeki mock sağlayıcılar değişmeden çalışır).
- Simülasyon ve duruşma kayıtlarındaki `model` alanı Standart modeli göstermeye devam eder.

## 5. Arayüz

- `ChatLevelPicker`, seviye hatırlama (`localStorage`), istekteki `level` alanı ve `ChatStatus.levels` kaldırılır.
- Yanıt etiketi ("Basit · gpt-4o-mini") ve `CHAT_LEVEL_LABELS` / `answerLabel` kalır.

## 6. Test

- **Sınıflandırıcı:** geçerli yanıtlar (büyük harf, boşluk, açıklamalı metin, Türkçe kelimeler), anlaşılmaz yanıt, sağlayıcı hatası, zaman aşımı → `standard`; önceki sorunun prompt'a eklenmesi.
- **Sohbet akışı:** sınıflandırıcının seçtiği seviyenin sağlayıcı, geçmiş, talimat ve kayda yansıması; `CHAT_AUTO_LEVEL=false` iken sınıflandırıcının çağrılmaması; gövdedeki `level`'ın yok sayılması; status'ta `levels` olmaması.
- **LLM seviyeleri:** tablo; `LevelRoutedProvider`'ın göreve göre doğru modeli kurması ve önbelleklemesi; boş seviye modellerinde Standart'a düşme; analiz motorunda hâkim adımının Kapsamlı'ya, diğerlerinin Standart'a gitmesi; duruşmada karşı taraf/ara hâkim/son hâkim/JSON düzeltme görevleri; mock modun değişmemesi.
- **Frontend:** seçicinin olmaması, istekte `level` gönderilmemesi, etiketin görünmesi.
- **E2E:** soru sorulur, yanıtın altında "Standart · mock" görünür (mock sınıflandırma Standart'a düşer).
