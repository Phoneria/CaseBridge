# Etkileşimli Takvim ve E-posta Hatırlatmaları — Tasarım

- **Tarih:** 2026-10-02
- **Dal:** `feature/calendar-reminders` (`feature/ai-chat` üzerine)
- **Durum:** Onaylandı

## 1. Amaç

Takvimi salt okunur bir ay listesinden, olay eklenip düzenlenebilen, farklı görünümleri ve filtreleri olan bir çalışma alanına dönüştürmek; duruşma, görev ve etkinlikler için birkaç gün önceden sorumlu kişiye e-posta hatırlatması göndermek.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Etkileşim | Takvimden olay ekleme; hafta ve ajanda görünümü; filtreler; olay detay paneli. |
| Olay modeli | Yeni `calendar_events` tablosu (saatli, isteğe bağlı dava ve sorumlu). Görevler ve davalardaki duruşma tarihleri takvimde görünmeye devam eder. |
| Hatırlatma alıcısı | Sorumlu kişi: etkinlikte seçilen avukat, görevde atanan kişi, dava duruşmasında davanın sorumlu avukatı; yoksa oluşturan kişi. |
| Zamanlama | Olay başına seçilebilir. Varsayılanlar: duruşma `[3, 1]`, diğer etkinlik `[1]`, görev `[1]`. Kapatılabilir (`[]`). |
| E-posta | SMTP (stdlib `smtplib`, yeni paket yok). Docker'da varsayılan Mailpit. `console` modu yalnızca loglar. |
| Kapsam dışı | Sürükle-bırak, tekrarlayan etkinlikler, uygulama içi/push bildirim, harici takvim eşitleme, kullanıcı başına bildirim tercihi. |

## 3. Veri modeli

### 3.1 `calendar_events` (yeni)

| Alan | Tür | Not |
|---|---|---|
| `id` | String(36) | |
| `law_firm_id` | FK `law_firms` | Tüm sorgular buna göre süzülür |
| `title` | String(200) | 1–200 karakter |
| `event_type` | `hearing` \| `meeting` \| `client_meeting` \| `other` | Türkçe etiketler: Duruşma, Toplantı, Müvekkil görüşmesi, Diğer |
| `starts_at` | DateTime | Uygulama saat diliminde (`APP_TIMEZONE`) yerel saat olarak saklanır (naive) |
| `all_day` | Boolean | `true` ise saat yok sayılır |
| `duration_minutes` | Integer | Varsayılan 60, 5–1440 |
| `location` | String(200), boş olabilir | |
| `notes` | Text, boş olabilir | |
| `case_id` | FK `cases`, boş olabilir | Aynı bürodan olmalı |
| `assignee_id` | FK `users`, boş olabilir | Aynı bürodan olmalı |
| `created_by` | FK `users` | |
| `reminder_days` | JSON (int listesi) | Her değer 0–30, tekrarsız, büyükten küçüğe sıralı |
| `created_at`, `updated_at` | DateTime | |

- Davaya bağlı bir **duruşma** etkinliği oluşturulur veya tarihi değiştirilirse: etkinliğin günü bugün veya sonrasıysa ve davanın `next_hearing_date` alanı boşsa ya da bu günden sonraysa, `next_hearing_date` bu güne çekilir.
- Takvimde, aynı dava ve aynı gün için hem duruşma etkinliği hem davanın `next_hearing_date` kaydı varsa yalnızca etkinlik gösterilir.

### 3.2 `tasks.reminder_days` (yeni sütun)

JSON int listesi, boş olabilir. Boş → varsayılan `[1]`.

### 3.3 `reminder_deliveries` (yeni)

| Alan | Not |
|---|---|
| `id`, `law_firm_id` | |
| `source_type` | `event` \| `task` \| `case_hearing` |
| `source_id` | Etkinlik, görev veya dava kimliği |
| `occurrence_date` | Olayın günü (Date) |
| `days_before` | int |
| `recipient_user_id` | |
| `status` | `sent` \| `failed` |
| `attempts` | int |
| `last_error` | String(300), boş olabilir (kişisel veri içermeyen kısa hata) |
| `sent_at`, `created_at`, `updated_at` | |

Benzersizlik: (`source_type`, `source_id`, `occurrence_date`, `days_before`, `recipient_user_id`). Olay başka güne taşınırsa `occurrence_date` değişir ve yeni hatırlatma oluşur.

## 4. Hatırlatma gönderimi

### 4.1 E-posta katmanı (`app/services/email.py`)

- `EmailMessage` (to, subject, text, html) ve `send_email(message)`.
- `EMAIL_BACKEND=console`: alıcı ve konu loglanır, gövde loglanmaz. `smtp`: `smtplib.SMTP` (+ `SMTP_USE_TLS` ise STARTTLS, kullanıcı adı varsa login), zaman aşımı `SMTP_TIMEOUT_SECONDS`.
- Ayarlar: `EMAIL_BACKEND` (varsayılan `console`), `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS` (true), `SMTP_FROM` (`CaseBridge <no-reply@casebridge.local>`), `SMTP_TIMEOUT_SECONDS` (10). Şifre hiçbir yerde loglanmaz/döndürülmez.

### 4.2 Hatırlatma servisi ve işleyici

- `ReminderService.collect_due(now_local)`: gönderilmesi gereken hatırlatmaları üretir.
  - Kaynaklar: tüm bürolardaki etkinlikler; `pending` görevler (`due_date` dolu); `next_hearing_date` dolu davalar (aynı gün davaya bağlı duruşma etkinliği varsa atlanır).
  - Olayın günü `D` ve her `d ∈ reminder_days` için: `today == D - d` (ya da `D - d < today < D` aralığında daha önce gönderilmemişse — sunucu kapalıyken kaçırılanlar telafi edilir) ve `now_local.hour >= REMINDER_SEND_HOUR` ise hatırlatma vadesi gelmiştir. Geçmiş olaylar (`D < today`) atlanır. `d = 0` → olay günü sabahı.
  - Alıcı: §2'deki sıra; e-postası olmayan veya pasif kullanıcı atlanır.
  - Daha önce `sent` olan kayıtlar atlanır; `failed` kayıtlar `attempts < REMINDER_MAX_ATTEMPTS` (3) ise yeniden denenir.
- `ReminderService.send_due(now_local)`: her vadesi gelen hatırlatma için e-postayı gönderir ve teslim kaydını yazar (başarılı → `sent`, hata → `failed`, `attempts+1`).
- İşleyici (`app/services/reminder_worker.py`): mevcut işleyiciler gibi arka plan iş parçacığı; her `REMINDER_POLL_SECONDS` (900) saniyede `send_due` çalıştırır. `REMINDERS_ENABLED=false` ise başlatılmaz; testlerde başlatılmaz (mevcut işleyicilerle aynı koşul).
- Ayarlar: `APP_TIMEZONE` (`Europe/Istanbul`), `APP_BASE_URL` (`http://localhost:3000`), `REMINDERS_ENABLED` (true), `REMINDER_SEND_HOUR` (9), `REMINDER_POLL_SECONDS` (900), `REMINDER_MAX_ATTEMPTS` (3).

### 4.3 E-posta içeriği (Türkçe)

- Konu: `Hatırlatma: {gün ifadesi} {tür} – {başlık}`. Gün ifadesi: `bugün`, `yarın`, `{d} gün sonra`. Örn. "Hatırlatma: 3 gün sonra Duruşma – Ticari Kira Uyarlama Davası".
- Gövde: olay türü, başlık, tarih (gg.aa.yyyy), saat (tüm gün değilse), konum, dava adı; bağlantılar: dava (`{APP_BASE_URL}/davalar/{case_id}`) ve takvim (`{APP_BASE_URL}/takvim?ay=YYYY-MM`). Düz metin + basit HTML. Alt bilgi: "Bu e-posta CaseBridge tarafından otomatik gönderildi."

### 4.4 Test e-postası

`POST /notifications/test-email`: giriş yapan kullanıcıya "CaseBridge test e-postası" gönderir. Başarılı → 200 `{sent: true, backend}`; SMTP hatası → 502 ve Türkçe mesaj ("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.").

### 4.5 Docker

`docker-compose.yml`'e `mailpit` servisi (`axllent/mailpit`, UI 8025, SMTP 1025). Backend ortamı: `EMAIL_BACKEND: ${EMAIL_BACKEND:-smtp}`, `SMTP_HOST: ${SMTP_HOST:-mailpit}`, `SMTP_PORT: ${SMTP_PORT:-1025}`, `SMTP_USE_TLS: ${SMTP_USE_TLS:-false}`. `.env` dosyasında gerçek SMTP verilirse o kullanılır.

## 5. API

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Aralıktaki olaylar (varsayılan: bugünden −31 / +62 gün). Her öğe: `id` (`event:<id>`, `task:<id>`, `hearing:<case_id>`), `kind` (`event` \| `task` \| `case_hearing`), `event_type` (`hearing` \| `meeting` \| `client_meeting` \| `other` \| `task`), `title`, `date`, `start` (ISO, saatli ise), `end`, `all_day`, `case_id`, `case_name`, `task_id`, `event_id`, `assignee_id`, `assignee_name`, `location`, `notes`, `reminder_days`, `editable`. Eski alanlar (`date`, `title`, `case_id`, `case_name`, `task_id`) korunur. |
| POST | `/calendar/events` | Etkinlik oluşturur (201). Dava/sorumlu başka bürodaysa 404. |
| GET | `/calendar/events/{id}` | |
| PATCH | `/calendar/events/{id}` | Kısmi güncelleme. |
| DELETE | `/calendar/events/{id}` | 204. |
| PATCH | `/tasks/{id}` | Mevcut güncellemeye `reminder_days` eklenir. |
| POST | `/notifications/test-email` | §4.4 |

## 6. Frontend

- **Görünümler** (`?gorunum=ay|hafta|ajanda`, varsayılan `ay`):
  - Ay: mevcut ızgara; boş güne tıklama ekleme formunu o güne açar.
  - Hafta (`?hafta=YYYY-MM-DD`, pazartesi): üstte tüm gün satırı (görevler, saatsiz duruşmalar, tüm gün etkinlikler), altında 08:00–20:00 saat ızgarası; saatli etkinlik süresine göre yükseklik; boş saat dilimine tıklama o saate ekleme.
  - Ajanda: bugünden itibaren 30 gün, gün başlıklarıyla liste; "Bugün" ve "Bu hafta" vurgulu.
- **Filtreler** (URL'de): tür (`tur=`), sorumlu (`sorumlu=`), dava (`dava=`), "Yalnızca benimkiler" (`benim=1`). Mevcut `goster` filtresinin yerini alır (geriye uyumlu okuma).
- **Ekleme/düzenleme formu** (modal): başlık, tür, tarih, tüm gün, saat, süre, dava (mevcut dava arama bileşeni), sorumlu (kullanıcı listesi), konum, not, hatırlatma seçenekleri (Aynı gün, 1, 3, 7 gün önce; çoklu seçim; "Hatırlatma yok").
- **Detay paneli** (sağ çekmece): tür rozeti, tarih/saat, dava bağlantısı, sorumlu, konum, not, hatırlatmalar.
  - Etkinlik: Düzenle, Sil (satır içi onay), hatırlatma değiştir.
  - Görev: "Tamamlandı" işaretle, hatırlatma değiştir, "Göreve git".
  - Dava duruşması: "Davayı aç", varsayılan hatırlatma bilgisi.
- **Ayarlar sayfası:** "Bildirimler" bölümü: e-posta yöntemi bilgisi ve "Test e-postası gönder" butonu.

## 7. Test

- **Backend:** etkinlik CRUD ve büro/kullanıcı izolasyonu; dava/sorumlu doğrulaması; duruşma etkinliğinin `next_hearing_date`'i güncellemesi; takvimde tekrar gizleme; tarih aralığı süzgeci; görev `reminder_days`.
- **Hatırlatma:** sabit `now` ile vade hesabı (gün, saat eşiği, kaçırılanın telafisi, geçmiş olaylar), alıcı seçimi, tekrar gönderilmeme, tarih değişince yeni hatırlatma, hata → `failed` ve yeniden deneme sınırı; e-posta içeriği.
- **E-posta:** `console` modu loglar (gövdesiz); `smtp` modu sahte SMTP sınıfıyla (STARTTLS, login, gönderim); test e-postası uç noktası.
- **Frontend:** görünüm geçişi ve URL; hafta görünümünde saatli yerleşim; ajanda listesi; filtreler; ekleme formu doğrulama ve gönderim; detay paneli eylemleri; Ayarlar test e-postası.
- **E2E:** takvimden etkinlik ekle → hafta görünümünde gör → hatırlatmayı değiştir → sil.
