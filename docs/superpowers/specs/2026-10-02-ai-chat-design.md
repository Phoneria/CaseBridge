# CaseBridge AI Hukuk Asistanı (Sohbet) — Tasarım

- **Tarih:** 2026-10-02
- **Dal:** `feature/ai-chat` (`feature/casebridge-ai` üzerine)
- **Durum:** Onaylandı. Uygulama planı: `docs/superpowers/plans/2026-10-02-ai-chat.md`

## 1. Amaç

CaseBridge AI alanına genel bir Türk hukuku sohbet asistanı eklemek. Asistan bugün OpenAI GPT API ile çalışacak. İleride fine-tune edilmiş bir model hazır olduğunda kod değişmeden yalnızca ayarla ona geçilecek. Bu arada kullanıcı geri bildirimleri, fine-tune için eğitim verisi olarak toplanacak.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Model | Başlangıçta OpenAI GPT (`CHAT_PROVIDER=openai`, `CHAT_MODEL=gpt-4o-mini`). Fine-tune model gelince yalnızca `CHAT_MODEL` (OpenAI fine-tune: `ft:...`) ya da `CHAT_PROVIDER=ollama` + model adı değişir. |
| Bağlam | Yalnızca genel hukuk asistanı. Dava, müvekkil veya belge verisi modele gönderilmez. |
| Yanıt | Kelime kelime akış (SSE). Kullanıcı akışı durdurabilir. |
| Geçmiş | Kullanıcıya özel, kayıtlı sohbetler: liste, yeni sohbet, yeniden adlandırma, silme. Aynı bürodaki başkaları göremez. |
| Fine-tune hazırlığı | Her asistan yanıtına 👍/👎. Admin, olumlu oylanmış yanıtları OpenAI fine-tune formatında (JSONL) dışa aktarır. |
| Sağlayıcı ayrımı | Sohbet sağlayıcısı (`CHAT_PROVIDER`) analiz ve duruşma sağlayıcısından (`LLM_PROVIDER`) bağımsızdır. |

**Kapsam dışı:** fine-tune eğitiminin kendisi, dava bağlamı, dosya yükleme, sohbet paylaşımı, sohbet içinde arama.

## 3. Backend

### 3.1 Sağlayıcı katmanı (`app/ai/chat/`)

- **`ChatProvider` arayüzü (soyut sınıf):**
  - Alanlar: `provider: str`, `model: str`, `external: bool` (veri büro dışına çıkıyor mu).
  - `stream(messages: list[ChatTurn]) -> Iterator[str]`: metin parçalarını sırayla üretir.
  - Akış bitince `last_usage` (`prompt_tokens`, `completion_tokens`) dolar.
  - Hatalarda yalnızca `AIProviderError` ya da `AIProviderTimeoutError` fırlatır; SDK'ya özgü bir istisna dışarı sızmaz.
- **`ChatTurn`:** `{role: "system" | "user" | "assistant", content: str}`.
- **Uygulamalar:**
  - `OpenAIChatProvider`: `chat.completions.create(stream=True, stream_options={"include_usage": True})`.
  - `OllamaChatProvider`: `POST /api/chat` ile `stream: true`, NDJSON satırlarını okur. `external=False`.
  - `MockChatProvider`: deterministik parçalar üretir, ağ çağrısı yapmaz. Testlerin ve `CHAT_PROVIDER=mock`'un varsayılanıdır.
- **Fabrika ve durum:**
  - `get_chat_provider()`: eksik yapılandırmada `AIProviderConfigError` fırlatır; sessizce mock'a düşmez.
  - `get_chat_provider_status()`: `{provider, model, configured, external, error}` döner, sır içermez.
- **Ayarlar (`config.py` ve `.env.example`):**
  - `CHAT_PROVIDER` (`openai` | `ollama` | `mock`, varsayılan `mock`).
  - `CHAT_MODEL` (varsayılan `gpt-4o-mini`).
  - `CHAT_TIMEOUT_SECONDS` (varsayılan 60).
  - `CHAT_HISTORY_LIMIT` (varsayılan 20).
  - Mevcut `OPENAI_API_KEY` ve `OLLAMA_BASE_URL` kullanılır.
- **Sistem prompt'u:**
  - `app/ai/chat/prompt.py` içinde `CHAT_SYSTEM_PROMPT` ve `CHAT_PROMPT_VERSION = "2026-10-02"` olarak durur.
  - İçerik:
    - Türkçe yanıt verir; genel Türk hukuku bilgisi sunar.
    - Mevzuatı madde numarasıyla anar, ancak emin olmadığı yerde bunu açıkça söyler.
    - Kesin sonuç vaat etmez; hukuki danışmanlık yerine geçmediğini belirtir.
    - Kullanıcıdan müvekkil kişisel verisi istemez.

### 3.2 Veri modeli (Alembic migration, `down_revision = "b83a4e0c1d29"`)

- **`chat_conversations`:** `id`, `law_firm_id`, `user_id`, `title` (String 120), `created_at`, `updated_at`.
- **`chat_messages`:**
  - Ortak alanlar: `id`, `conversation_id` (FK, `ondelete=CASCADE`), `law_firm_id`, `role` (`user` | `assistant`), `content` (Text), `created_at`.
  - Yalnızca asistan mesajlarında dolu olanlar:
    - `status`: `streaming`, `complete`, `error` ya da `stopped`.
    - `model`.
    - `prompt_tokens`, `completion_tokens`, `latency_ms`.
    - `feedback`: `1`, `-1` ya da boş.
- **Erişim:** Bütün sorgular `law_firm_id` ve `user_id` ile süzülür. Başkasının sohbetine erişim denemesine 404 döner.
- **Başlık:** İlk kullanıcı mesajının ilk 60 karakterinden üretilir (boşluklar sadeleştirilir, kesildiyse sonuna `…`). Kullanıcı yeniden adlandırabilir.
- **Silme:** Kalıcıdır; mesajlar da silinir.

### 3.3 API (`/chat`)

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/chat/status` | `get_chat_provider_status()` |
| GET | `/chat/conversations` | Kullanıcının sohbetleri; `updated_at` azalan. Alanlar: `id`, `title`, `updated_at`. |
| POST | `/chat/conversations` | Boş sohbet oluşturur (`title` = "Yeni sohbet"). 201 döner. |
| GET | `/chat/conversations/{id}` | Sohbet + mesajlar (`created_at` artan). |
| PATCH | `/chat/conversations/{id}` | `{title}`: 1–120 karakter, boşlukları kırpılmış. |
| DELETE | `/chat/conversations/{id}` | 204 |
| POST | `/chat/conversations/{id}/messages` | `{content}` (1–8000 karakter). `text/event-stream` döner. |
| PUT | `/chat/messages/{id}/feedback` | `{value: 1 \| -1 \| 0}`; `0` oyu temizler. Yalnızca asistanın tamamlanmış (`complete`) mesajları oylanabilir, diğerlerine 422 döner. |
| GET | `/chat/export.jsonl` | Yalnızca admin (diğerlerine 403). İsteğe bağlı `?model=` parametresi. Dosya olarak indirilir. |

**Mesaj gönderme akışı:**
1. Sağlayıcı alınır; yapılandırma hatası varsa 503 ve açık bir mesaj döner. Akış başlamaz, kayıt yapılmaz.
2. Kullanıcı mesajı kaydedilir. Sohbetin ilk mesajıysa ve başlık hâlâ "Yeni sohbet" ise başlık bu mesajdan üretilir.
3. Asistan mesajı `status="streaming"`, boş içerik ve `model` ile oluşturulur.
4. Geçmiş hazırlanır: sistem prompt'u + son `CHAT_HISTORY_LIMIT` mesaj. Yalnızca kullanıcı mesajları ve tamamlanmış asistan mesajları dahil edilir; yeni kullanıcı mesajı bunun içinde.
5. SSE olayları (her biri `data: <json>\n\n`):
   - Önce `{"type": "start", "user_message": {...}, "assistant_message_id": "..."}`.
   - Her parça için `{"type": "delta", "text": "..."}`.
   - Bitince `{"type": "done", "message": {...}}`.
   - Hata olursa `{"type": "error", "message": "<Türkçe mesaj>"}`.
6. Kayıt, akışın sonunda ayrı bir veritabanı oturumunda yapılır, çünkü istek oturumu akış başlamadan kapanır. Asistan mesajı içerik, durum, token sayıları ve gecikmeyle güncellenir. Hata olursa `status="error"` ve o ana kadarki içerik yazılır. İstemci bağlantıyı keserse `status="stopped"` ve kısmi içerik yazılır. Sohbetin `updated_at` alanı her durumda güncellenir.

**JSONL dışa aktarma:**
- Kapsam: Admin'in bürosundaki bütün sohbetler. Kaynak olarak `feedback == 1` ve `status == complete` olan her asistan mesajı alınır; `?model=` verilmişse yalnızca o modelin mesajları.
- Her kaynak mesaj bir satır üretir: `{"messages": [{"role": "system", ...}, ...]}`.
- Satırın içeriği: o mesaja kadarki geçmiş, yani kullanıcı mesajları ve tamamlanmış asistan mesajları. Kaynak mesaj dizinin sonundadır. Başına o anki `CHAT_SYSTEM_PROMPT` eklenir.
- Biçim: OpenAI chat fine-tuning formatı, UTF-8, `ensure_ascii=False`.

## 4. Frontend

### 4.1 Yerleşim

- **Rota:** `/ai/sohbet`. Açık sohbet `?sohbet=<id>` parametresiyle belirtilir.
- **Erişim noktaları:**
  - Sidebar'daki CaseBridge AI bloğuna "Hukuk Asistanı" alt öğesi eklenir.
  - `/ai` giriş sayfasına üçüncü ürün kartı eklenir: "Hukuk Asistanı", "Sohbete başla" butonuyla.
  - `AI_ROUTES.chat = "/ai/sohbet"`.
- **Sayfa:** `AiHero` (compact; başlık "Hukuk Asistanı"; model durumu satırı) ve altında iki sütun:
  - Solda sohbet listesi (`ChatConversationList`): "Yeni sohbet" butonu; her sohbetin başlığı ve tarihi; seçili olan vurgulu. Her satırda "Yeniden adlandır" ve "Sil" eylemleri; silmeden önce onay sorulur (inline, `window.confirm` kullanılmaz).
  - Sağda mesaj alanı (`ChatThread`):
    - Kullanıcı mesajları sağda, asistan mesajları solda `AiMark` ile.
    - Asistan yanıtı `react-markdown` ile işlenir; ham HTML devre dışıdır.
    - Akış sırasında yanıp sönen bir imleç gösterilir.
    - Tamamlanmış asistan mesajlarının altında 👍/👎 butonları (`aria-pressed` ile).
    - `error` ve `stopped` durumları rozetle gösterilir.
  - Altta yazma alanı (`ChatComposer`): Enter gönderir, Shift+Enter yeni satır ekler. Akış sırasında "Gönder" yerine "Durdur" butonu çıkar.
  - Boş durumda üç örnek soru çipi gösterilir.
- **Uyarılar:**
  - Yazma alanının altında her zaman: "CaseBridge AI hukuki danışmanlık yerine geçmez; yanıtları doğrulayın."
  - `external` ise ek olarak: "Mesajlar harici bir AI sağlayıcısına gönderilir; müvekkil kişisel verisi girmeyin."
- **Durum hatası:** `status.configured === false` ise yazma alanı devre dışı kalır ve `AiModelStatus` uyarısı gösterilir.
- **Admin dışa aktarma:** `getMe()` ile rol `admin` ise başlıkta "Eğitim verisini indir (JSONL)" butonu görünür (`saveBlob` ile).
- **Mobil:** 768px altında sohbet listesi, mesaj alanının üstünde açılır-kapanır bir panel olur.

### 4.2 Akış istemcisi (`lib/chatStream.ts`)

- `streamChatMessage(conversationId, content, { signal, onEvent })` fonksiyonu.
  - `fetch` ile POST atar, `Authorization` başlığı ile.
  - `response.body` okuyucusundan SSE satırlarını ayrıştırır: parçalı veri ve birden çok olay tek okumada gelebilir.
  - Her olay için `onEvent(event)` çağrılır.
  - Akış bitince ya da `signal` iptal edilince sonlanır.
- HTTP hataları (503, 404, 422) `ApiError` olarak fırlatılır.
- Ayrıştırıcı saf bir fonksiyon olarak ayrıca dışa aktarılır (`createSseParser`) ve birim testine tabidir.

## 5. Hata durumları

| Durum | Davranış |
|---|---|
| Sağlayıcı yapılandırılmamış | `/chat/status` `configured:false`; mesaj gönderme 503; arayüzde yazma alanı kapalı ve uyarı görünür. |
| Sağlayıcı zaman aşımı ya da hata | `error` olayı; asistan mesajı `error` olarak kaydedilir; arayüzde hata rozeti ve mesajı. |
| Kullanıcı durdurdu | İstek iptal edilir; backend kısmi içeriği `stopped` olarak kaydeder; arayüzde "Durduruldu" rozeti. |
| Başkasının sohbeti | 404. |
| Admin olmayan export | 403. |

## 6. Test

- **Backend (pytest):**
  - Sağlayıcılar: OpenAI akışının sahte istemciyle ayrıştırılması (usage dahil), Ollama NDJSON akışının `httpx.MockTransport` ile ayrıştırılması, mock sağlayıcı, fabrikanın yapılandırma hataları.
  - API:
    - Sohbet işlemleri ve kullanıcı/büro izolasyonu.
    - Mesaj gönderme: SSE olay sırası, kayıt, başlık üretimi, geçmiş limiti, sağlayıcı hatasında `error` kaydı, yapılandırma hatasında 503.
    - Geri bildirim.
    - Export: admin kısıtı, format, `?model=` filtresi.
  - Migration: `alembic upgrade head` boş bir SQLite üzerinde çalışır.
- **Frontend (Vitest):**
  - `createSseParser`: parçalı satırlar, birden çok olay.
  - `ChatView`:
    - Sohbet listesi.
    - Gönderince parçaların birleşerek görünmesi.
    - Durdur.
    - Geri bildirim.
    - Admin butonu.
    - Yapılandırılmamış durum.
    - Harici sağlayıcı uyarısı.
  - Sidebar ve giriş sayfasındaki yeni kart ile öğe.
- **E2E (Playwright, mock sağlayıcıyla):** `/ai/sohbet` açılır, mesaj gönderilir, akan yanıt görünür, 👍 verilir, sayfa yenilenince sohbet listede kalır.

## 7. Bağımlılıklar

- Frontend: `react-markdown@9.1.0`, ham HTML olmadan kullanılır.
- Backend: yeni paket yok (`openai` ve `httpx` zaten yüklü).
