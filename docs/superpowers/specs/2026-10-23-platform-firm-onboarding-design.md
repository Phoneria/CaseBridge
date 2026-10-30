# Platform paneliyle büro açma — Tasarım

Tarih: 2026-10-23
Durum: Onaylandı

## Amaç

CaseBridge, bulutta çalışan ve birçok büroya açık bir SaaS hizmeti olacak. Bürolara kurulum yapılmayacak. Bu yüzden büro ve ilk yönetici artık `python -m app.db.create_admin` komutuyla değil, CaseBridge ekibinin kullandığı bir **platform paneli** üzerinden oluşturulur. Büro içi kullanıcı yönetimi (Ayarlar > Kullanıcılar) değişmez.

## Kararlar

- Büroları CaseBridge ekibi platform panelinden açar. Kendi kendine kayıt yoktur.
- Platform ekibi, mevcut `users` tablosunda normal kullanıcıdır ve `is_platform_admin` bayrağı taşır. Bu kullanıcılar iç bir "CaseBridge Platform" bürosuna aittir. Büro izolasyonu sayesinde müşteri bürolarının dava verisini göremezler.
- İlk platform yöneticisi `PLATFORM_ADMIN_EMAILS` ortam değişkeniyle oluşur. Sunucuda komut çalıştırmak gerekmez.
- İlk sürümün kapsamı:
  - büro ve ilk yönetici oluşturma,
  - büroları listeleme,
  - daveti yeniden gönderme ve ek yönetici ekleme,
  - büroyu askıya alma ve yeniden aktifleştirme.

## 1. Veri modeli

Tek bir Alembic migration'ı eklenir:

- `law_firms.is_active` — `bool`, NOT NULL, varsayılan `true`.
- `law_firms.suspended_at` — `datetime`, NULL olabilir. Son askıya alma zamanıdır; aktifleştirmede NULL yapılır.
- `law_firms.is_platform` — `bool`, NOT NULL, varsayılan `false`. İç platform bürosunu işaretler. Bu büro `/platform/firms` listesinde görünmez ve askıya alınamaz.
- `users.is_platform_admin` — `bool`, NOT NULL, varsayılan `false`.

Mevcut satırlar varsayılan değerleri alır. `UserOut` şemasına `is_platform_admin` eklenir; `/users/me` bu alanı döndürür.

## 2. İlk platform yöneticisi (başlangıç kurulumu)

Yeni ayar: `PLATFORM_ADMIN_EMAILS` (virgülle ayrılmış liste, varsayılan boş).

Uygulama açılırken (`lifespan` içinde, migration'lardan sonra) `ensure_platform_admins(db, emails)` çalışır:

1. `is_platform=true` olan büro yoksa "CaseBridge Platform" adıyla oluşturulur.
2. Listedeki her e-posta küçük harfe çevrilir, boşluklardan temizlenir ve tekrarlar atılır. Geçersiz adresler loglanır ve atlanır. Sonra her e-posta için:
   - Kullanıcı yoksa, platform bürosunda davetli bir kullanıcı oluşturulur. Değerler: `role=ADMIN`, `is_platform_admin=true`, `full_name="Platform Yöneticisi"`. Ad, Hesabım sayfasından değiştirilebilir. Ardından davet e-postası gönderilir.
   - Kullanıcı platform bürosundaysa ve bayrağı yoksa bayrak verilir.
   - Kullanıcı platform bürosunda, hâlâ davetli durumda ve kullanılabilir bir davet bağlantısı yoksa, yeni davet gönderilir. Bağlantı geçerliyse e-posta gönderilmez; böylece her yeniden başlatmada spam olmaz.
   - Kullanıcı bir müşteri bürosundaysa hesaba dokunulmaz ve uyarı loglanır.
3. E-posta gönderilemezse hata loglanır, kayıt yine oluşur ve uygulama açılmaya devam eder. Bir sonraki açılışta davet yeniden denenir, çünkü kullanılabilir davet yoktur.

Bir e-postayı listeden çıkarmak yetkiyi geri almaz. Yetki kaldırma bu sürümün kapsamı dışındadır.

## 3. Platform API'si

Yeni router: `app/api/routes/platform.py`, prefix `/platform`. Tüm uçlar `get_current_platform_admin` bağımlılığını kullanır: istekte bulunan kullanıcının `is_platform_admin=true` olması gerekir, değilse 403 döner. İş mantığı `app/services/platform_service.py` içindedir. Yönetici oluşturma ve davet gönderme mevcut `create_pending_user`, `prepare_invite_email` ve `deliver` fonksiyonlarıyla yapılır.

| Uç | Gövde | Yanıt |
|---|---|---|
| `GET /platform/firms` | — | `[{id, name, created_at, is_active, suspended_at, active_user_count, admins: [{id, full_name, email, status}]}]`, ada göre sıralı, platform bürosu hariç |
| `POST /platform/firms` | `{name, admin_full_name, admin_email}` | 201, `{firm, admin, email_sent}` |
| `POST /platform/firms/{id}/admins` | `{full_name, email}` | 201, `{admin, email_sent}` |
| `POST /platform/firms/{id}/admins/{user_id}/invite` | — | `{admin, email_sent}` |
| `POST /platform/firms/{id}/suspend` | — | büro özeti |
| `POST /platform/firms/{id}/activate` | — | büro özeti |

Kurallar ve hata mesajları:

- Büro adı, mevcut `clean_single_line` kuralıyla temizlenir ve 1-255 karakter olmalıdır; aksi hâlde 422 döner.
- Aynı adda bir büro varsa (büyük/küçük harf duyarsız karşılaştırma) 409 ve "Bu adla bir büro zaten var." döner.
- Kayıtlı e-posta için 409 ve mevcut `EMAIL_TAKEN` mesajı döner. Eşzamanlı isteklerden doğan `IntegrityError` da 409 olarak döner.
- Büro bulunamazsa ya da büro platform bürosuysa 404 döner. `user_id` o büronun yöneticisi değilse de 404 döner.
- Yeniden davet yalnızca aktif ve şifresini belirlememiş yöneticiye gönderilir; diğer durumlarda 409 ve mevcut mesajlar döner.
- Askıya alınmış bir büroya yönetici eklenebilir. Ancak davet e-postası gönderilmez ve yanıt `email_sent=false` olur; arayüz bunu açıklar. Aynı şekilde askıdaki büroda yeniden davet 409 ve "Askıdaki büroya davet gönderilemez." döner.
- E-posta gönderilemezse kayıt commit edilir ve yanıt `email_sent=false` olur. Bu, Kullanıcılar panelindeki davranışla aynıdır.
- Askıya alma ve aktifleştirme idempotenttir.

## 4. Askıya almanın etkisi

Askıdaki büronun (`law_firm.is_active=false`) kullanıcıları için:

- **Giriş:** Şifre doğruysa 403 ve "Büronuzun erişimi askıya alındı." döner. Şifre yanlışsa normal 401 döner; böylece askı bilgisi şifreyi bilmeyen birine sızmaz.
- **Mevcut oturumlar:** `get_current_user`, büro askıdaysa 403 ve aynı mesajı döndürür. Frontend bunu oturum sonu olarak işler ve giriş sayfasında mesajı gösterir.
- **Davet ve sıfırlama bağlantıları:** `token-info` ve `set-password` 410 ve mevcut `LINK_INVALID` mesajını döndürür.
- **Şifremi unuttum:** Yanıt aynı kalır (202), ama e-posta gönderilmez.
- **Hatırlatma e-postaları:** `reminder_service` askıdaki büroların kullanıcılarını atlar.

Veriler silinmez. Büro aktifleştirildiğinde her şey kaldığı yerden devam eder. Platform bürosu askıya alınamaz.

## 5. Arayüz

- `/platform` sayfası (`PlatformView`) yalnızca `is_platform_admin` kullanıcılara açıktır. Diğer kullanıcılar `/dashboard`'a yönlendirilir.
- Platform yöneticisi giriş yaptığında ya da `/` adresini açtığında `/platform` sayfasına gider. Kenar çubuğunda yalnızca "Büro Yönetimi" ve "Hesabım" görünür.
- Büro tablosunun sütunları: büro adı, durum (Aktif / Askıda), aktif kullanıcı sayısı, yöneticiler (bekleyen davet rozetiyle) ve oluşturulma tarihi.
- "Yeni büro" penceresi (`ModalFrame`) büro adı, yönetici adı soyadı ve e-posta alanlarını içerir. `email_sent=false` gelirse uyarı gösterilir.
- Bir satıra tıklanınca açılan büro panelinde şunlar yer alır:
  - yönetici listesi,
  - davetli yöneticiler için "Daveti yeniden gönder",
  - "Yönetici ekle",
  - onay pencereli "Büroyu askıya al" / "Aktifleştir".
- Giriş sayfası, 403 askı mesajını hata olarak gösterir.

## 6. Kaldırılan ve güncellenenler

- `backend/app/db/create_admin.py` ve `backend/tests/integration/test_create_admin.py` silinir.
- README güncellenir: "kurulum" bölümü platform akışını anlatır.
- `.env.example` dosyasına `PLATFORM_ADMIN_EMAILS` eklenir.
- Demo modunda (`SEED_DEMO_DATA=true`) seed, platform bürosunu ve şifresi belirlenmiş `platform@demo.casebridge.dev` / `demo1234` platform yöneticisini oluşturur. Seed idempotent kalır.
- Giriş sayfasındaki demo hesap ipucuna platform hesabı eklenir.

## 7. Testler

- **Backend (pytest)**
  - `ensure_platform_admins`: oluşturma, tekrar çalıştırma (e-posta gönderilmemeli), süresi dolmuş davetin yenilenmesi, müşteri bürosundaki e-postanın atlanması, e-posta hatasında açılışın sürmesi.
  - Platform uçları için yetki: avukat ve büro yöneticisi 403 almalı.
  - Oluşturma, aynı adlı büro, kayıtlı e-posta, ek yönetici, yeniden davet ve platform bürosunun gizlenmesi.
  - Askı: giriş (doğru şifre 403, yanlış şifre 401), mevcut oturum, `token-info`, `set-password`, şifremi unuttum ve hatırlatmalar.
- **Frontend (vitest):** `PlatformView` listeleme, yeni büro penceresi, `email_sent=false` uyarısı, askıya alma onayı ve platform kenar çubuğu.
- **E2E (Playwright, `14-platform-firms.spec.ts`):** platform girişi → büro aç → konsol e-postasındaki bağlantıyla şifre belirle → yönetici giriş yapar → büro askıya alınır → giriş engellenir.
