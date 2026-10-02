# Hukuk Asistanı — Yanıt Seviyeleri (Basit / Standart / Kapsamlı) — Tasarım

- **Tarih:** 2026-10-02
- **Dal:** `feature/ai-chat` (Hukuk Asistanı üzerine)
- **Durum:** Onaylandı

## 1. Amaç

Sohbet her soruda aynı modeli kullanmasın. Kullanıcı sorusunun karmaşıklığını seçsin; seviye modeli, yanıt uzunluğunu ve modele gönderilen geçmişi belirlesin. Böylece basit sorularda daha az token harcansın.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Seçimi kim yapar | Kullanıcı. Otomatik sınıflandırma yok. |
| Seviye sayısı | 3: `basic` (Basit), `standard` (Standart), `deep` (Kapsamlı) |
| Seviyenin etkisi | Model + yanıt uzunluğu (talimat + token tavanı) + gönderilen geçmiş miktarı |
| Varsayılan | Son kullanılan seviye (tarayıcıda hatırlanır); ilk açılışta Standart |
| Yaklaşım | Seviyeler backend'de tanımlanır; frontend yalnızca seviye adını gönderir (model adı göndermez). Tüm seviyeler aynı `CHAT_PROVIDER`'ı kullanır. |

**Kapsam dışı:** otomatik karmaşıklık tespiti, seviye başına farklı sağlayıcı, kullanım/maliyet paneli.

## 3. Backend

### 3.1 Ayarlar

| Ayar | Varsayılan | Açıklama |
|---|---|---|
| `CHAT_MODEL` | `gpt-4o-mini` | Standart seviyenin modeli (mevcut ayar) |
| `CHAT_MODEL_BASIC` | boş | Basit seviyenin modeli; boşsa `CHAT_MODEL` |
| `CHAT_MODEL_DEEP` | boş | Kapsamlı seviyenin modeli; boşsa `CHAT_MODEL` |
| `CHAT_MAX_TOKENS_BASIC` | `500` | Basit yanıt token tavanı |
| `CHAT_MAX_TOKENS_STANDARD` | `1500` | Standart yanıt token tavanı |
| `CHAT_MAX_TOKENS_DEEP` | `4000` | Kapsamlı yanıt token tavanı |
| `CHAT_HISTORY_LIMIT_BASIC` | `6` | Basit seviyede modele gönderilen son mesaj sayısı |
| `CHAT_HISTORY_LIMIT` | `20` | Standart ve Kapsamlı için (mevcut ayar) |

Mevcut `.env` dosyaları değişmeden çalışır: yeni model ayarları boşsa üç seviye de `CHAT_MODEL`'i kullanır.

### 3.2 Seviye katmanı (`app/ai/chat/levels.py`)

- `ChatLevel = Literal["basic", "standard", "deep"]`, `DEFAULT_CHAT_LEVEL = "standard"`.
- `get_level_config(level) -> ChatLevelConfig` (`level`, `label`, `model`, `max_tokens`, `history_limit`) ayarlardan okunur.
- Sistem talimatı: `system_prompt_for(level)` = `CHAT_SYSTEM_PROMPT` + seviyeye özel ek:
  - Basit: kısa ve öz yanıt (en fazla 3–5 cümle), gereksiz giriş ve tekrar yok.
  - Standart: ek yok (mevcut prompt aynen).
  - Kapsamlı: ayrıntılı, adım adım, ilgili mevzuat ve olası karşı görüşlerle.

### 3.3 Sağlayıcılar

- Sağlayıcılar `max_tokens: Optional[int]` alır.
  - OpenAI: `max_completion_tokens` olarak iletilir.
  - Ollama: `options.num_predict` olarak iletilir.
  - Mock: değeri saklar (test için).
- `get_chat_provider(level="standard")` seviyenin modeli ve token tavanıyla sağlayıcı kurar. Yapılandırma hatası davranışı aynıdır.
- `get_chat_provider_status()` ek olarak `levels: [{level, label, model}]` döner.

### 3.4 Veri ve API

- `chat_messages.level` (String(16), boş olabilir) eklenir (yeni migration). Asistan mesajına kullanılan seviye yazılır. Eski mesajlarda boştur.
- `ChatMessageOut` `level` alanını içerir.
- `POST /chat/conversations/{id}/messages` gövdesi `{content, level}`; `level` verilmezse `standard`, geçersizse 422.
- Gönderme akışı: seviyeye göre sağlayıcı alınır (yapılandırma hatası → 503, kayıt yok), asistan yer tutucusu `model` ve `level` ile oluşturulur, geçmiş `system_prompt_for(level)` + seviyenin `history_limit` kadar mesajı ile hazırlanır.
- JSONL export:
  - Her satırın sistem mesajı, o yanıtın seviyesine ait `system_prompt_for(level)` olur (seviyesi boş eski mesajlarda Standart, yani mevcut prompt).
  - İsteğe bağlı `?level=` süzgeci eklenir (`?model=` ile birlikte kullanılabilir).

## 4. Frontend

- **Seçici (`ChatLevelPicker`):** yazma alanının üstünde üç parçalı `radiogroup` ("Yanıt seviyesi"): Basit · Standart · Kapsamlı. Her seçeneğin altında/üzerinde kısa açıklama; `title` ile bağlı model adı (`/chat/status` → `levels`). Akış sırasında ve model yapılandırılmamışken devre dışı.
- **Hatırlama:** seçim `localStorage` anahtarı `casebridge_chat_level` ile saklanır; okunamazsa veya geçersizse Standart. Erişim hataları yutulur.
- **Gönderme:** `streamChatMessage(id, content, { level, signal, onEvent })` → istek gövdesi `{content, level}`.
- **Yanıt etiketi:** her asistan yanıtının altında küçük metin: `"<Seviye adı> · <model>"` (ör. "Basit · gpt-4o-mini"). Seviyesi olmayan eski mesajlarda yalnızca model, ikisi de yoksa hiçbir şey.
- Seviye etiketleri: `basic` → "Basit", `standard` → "Standart", `deep` → "Kapsamlı".

## 5. Test

- **Backend:** seviye→model/tavan/geçmiş eşlemesi ve boş model ayarlarının `CHAT_MODEL`'e düşmesi; OpenAI `max_completion_tokens`, Ollama `num_predict` iletimi; status `levels`; mesaj gönderiminde seviye kaydı, Basit'te kısa geçmiş ve ek talimat, geçersiz seviye 422, seviye verilmezse `standard`; export'ta seviyeye göre sistem prompt'u ve `?level=`; migration upgrade/downgrade.
- **Frontend:** `chatLevels` saklama/okuma (geçersiz değer, erişim hatası); seçicinin seçimi değiştirmesi ve hatırlaması; gönderimde seviyenin iletilmesi; yanıt etiketi; akışta seçicinin devre dışı olması.
- **E2E:** Basit seçilip soru sorulur, yanıtın altında "Basit · mock" görünür; sayfa yenilenince seçici Basit'te kalır.
