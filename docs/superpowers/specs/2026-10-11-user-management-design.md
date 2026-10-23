# Kullanıcı Yönetimi — Tasarım

- **Tarih:** 2026-10-11
- **Dal:** `feature/user-management` (`feature/case-intake` `7d6ed9f` üzerinden)
- **Durum:** Onaylandı

## 1. Amaç

Gerçek bir büronun uygulamayı kullanmaya başlayabilmesi: büro ve ilk yönetici kurulabilsin, yönetici avukat ekleyip düzenleyebilsin ve pasifleştirebilsin, kullanıcılar şifre belirleyip değiştirebilsin/sıfırlayabilsin, oturum kapatılabilsin. Bugün yalnızca seed'deki demo kullanıcılar var (`demo1234`), kullanıcı ekleme/düzenleme/şifre API'si yok, giriş formunda demo bilgileri hazır yazılı ve çıkış yok.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Yeni kullanıcı | Yönetici ekler; kullanıcıya e-postayla "şifreni belirle" daveti gider (72 saat, tek kullanımlık). Şifreyi kimse görmez. |
| Şifre sıfırlama | İkisi de: girişte "Şifremi unuttum" (bağlantı 1 saat) ve yöneticinin "Sıfırlama bağlantısı gönder"i. |
| Pasifleştirme | Açık davası/bekleyen görevi olan avukat, bunlar başka bir aktif avukata devredilmeden pasifleştirilemez; devir ve pasifleştirme tek işlemdir. |
| İlk kurulum | Komut satırı: `python -m app.db.create_admin`. `SEED_DEMO_DATA=false` iken demo büro/kullanıcı oluşmaz. |
| Ek kapsam | Çıkış (logout) ve E2E giriş yardımcısının düzeltilmesi. |
| Kapsam dışı | İki aşamalı doğrulama, kendi kendine kayıt, çoklu büro yönetimi, oturum listesi. |

## 3. Veri modeli

### 3.1 `users` tablosuna
- `password_set_at` (DateTime, nullable): şifrenin son belirlendiği an. `NULL` → şifre hiç belirlenmemiş (davet bekliyor). Migration mevcut kullanıcılar için `created_at` (yoksa şimdiki zaman) ile doldurur.
- `invited_at` (DateTime, nullable): son davetin gönderildiği an.
- Davet bekleyen kullanıcının `hashed_password` alanına rastgele, kullanılamaz bir özet yazılır (sütun `NOT NULL` kalır); `password_set_at IS NULL` iken giriş her zaman reddedilir.
- Görünen durum türetilir: `pending` (şifre belirlenmemiş, aktif), `active`, `inactive`.

### 3.2 Yeni `user_tokens` tablosu
- `id`, `user_id` (FK, index), `law_firm_id` (FK, index), `purpose` (`invite` | `reset`, String(20)), `token_hash` (String(64), unique; SHA-256 hex), `expires_at`, `used_at` (nullable), `created_by` (FK users, nullable), `created_at`.
- Token: `secrets.token_urlsafe(32)`; yalnızca özeti saklanır. Aynı kullanıcı + amaç için yeni token üretilince önceki kullanılmamış token'lar `used_at` ile geçersizleştirilir.
- Süreler: davet 72 saat, sıfırlama 1 saat (`INVITE_TOKEN_HOURS`, `RESET_TOKEN_MINUTES` ayarları; varsayılan 72 ve 60).

### 3.3 Oturum geçersizleştirme
- JWT'ye `pwd` iddiası eklenir: `password_set_at` zaman damgası (saniye). Her istekte kullanıcının güncel `password_set_at` değeriyle karşılaştırılır; uyuşmazsa 401. Şifre değişince/sıfırlanınca eski oturumlar kapanır. Pasif kullanıcı zaten her istekte reddediliyor; pasifleştirme ayrıca `password_set_at`'i ileri alır, böylece kullanıcı yeniden aktifleştirildiğinde pasifleştirmeden önceki oturumlar geri gelmez.

### 3.4 Şifre kuralı
- En az 10 karakter, en fazla 72 bayt (UTF-8; bcrypt 72 bayttan sonrasını yok saydığı için daha uzun şifre reddedilir — eski 128 karakter sınırının yerini alır); e-posta adresiyle (büyük/küçük harf duyarsız) aynı olamaz. Hata: "Şifre en az 10 karakter olmalı." / "Şifre en fazla 72 bayt olabilir (Türkçe karakterler 2 bayt sayılır)." / "Şifre e-posta adresinizle aynı olamaz."

## 4. İlk kurulum ve demo verisi
- `python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"`:
  - Büro yoksa oluşturur (aynı adlı büro varsa onu kullanır); e-posta zaten kayıtlıysa hata verip çıkar.
  - İstisna: e-posta aynı büronun, henüz şifresini belirlememiş (davet bekleyen) aktif yöneticisine aitse yeni bir davet gönderilir (eski davet bağlantıları geçersizleşir), "Davet yeniden gönderildi." yazılır ve çıkış kodu 0 olur.
  - Yöneticiyi davet bekleyen durumda oluşturur ve davet e-postasını gönderir (`EMAIL_BACKEND=console` ise e-posta, bağlantıyla birlikte konsola yazılır).
  - Çıkış kodu: başarı 0, hata 1; hata mesajı Türkçe.
- `SEED_DEMO_DATA=false`: seed demo büroyu ve demo kullanıcıları oluşturmaz (mevcut "demo verisini temizle" davranışı korunur; demo kullanıcılar da temizlenir, ancak başka büroların kullanıcılarına dokunulmaz). Bir kayda bağlı olduğu için tutulan demo hesabı hâlâ demo şifresini kullanıyorsa şifresi geçersiz kılınır: `password_set_at` boşaltılır, rastgele kullanılamaz bir özet yazılır, kullanılmamış bağlantıları geçersizleşir (`is_active` değişmez); hesap "Davet bekliyor" olur ve `demo1234` artık çalışmaz. Seed çıktısında "Şifresi geçersiz kılınan demo hesabı: <e-posta>" yazılır.
- Giriş formu boş gelir. Yeni `GET /auth/config` (giriş gerektirmez) → `{ demo_mode: bool }` (`SEED_DEMO_DATA` değeri); `true` ise formun altında "Demo hesapları" ipucu (demo e-postaları ve şifresi) gösterilir.

## 5. API

Tüm uçlar büroya göre kapsamlıdır; başka büronun kullanıcısı her yerde 404.

### 5.1 Yönetici (`/admin/users`, yalnızca `admin`; değilse 403)
- `GET /admin/users` → tüm kullanıcılar (aktif + pasif + davet bekleyen): `id, email, full_name, department, role, is_active, status, invited_at, password_set_at, created_at`.
- `POST /admin/users` `{ email, full_name, department?, role }` → 201; davet bekleyen kullanıcı oluşturur ve davet gönderir. E-posta küçük harfe çevrilir; kayıtlıysa 409 "Bu e-posta adresi zaten kayıtlı.".
- `PATCH /admin/users/{id}` `{ full_name?, department?, role?, email? }` → kendi rolünü düşüremez (409 "Kendi rolünüzü değiştiremezsiniz."), son aktif yöneticinin rolü düşürülemez (409 "Büroda en az bir aktif yönetici kalmalı."), e-posta çakışması 409.
- `POST /admin/users/{id}/invite` → davet bekleyen kullanıcıya daveti yeniden gönderir (şifresi belirlenmişse 409 "Kullanıcı şifresini zaten belirlemiş.").
- `POST /admin/users/{id}/password-reset` → aktif ve şifresi belirlenmiş kullanıcıya sıfırlama bağlantısı gönderir.
- `GET /admin/users/{id}/workload` → `{ open_cases: [{id, case_number, case_name}], pending_tasks: [{id, title, case_name}], precedents_reviewing: n, upcoming_events: n }` (açık dava: `status != kapali` ve arşivlenmemiş; bekleyen görev: `status == pending` ve kullanıcıya atanmış; yaklaşan etkinlik: kullanıcıya atanmış ve başlangıcı bugün (uygulama saat dilimi `APP_TIMEZONE`'a göre) ya da sonra olan takvim etkinliği).
- `POST /admin/users/{id}/deactivate` `{ transfer_to?: user_id }`:
  - Kendini pasifleştiremez (409 "Kendi hesabınızı pasifleştiremezsiniz."); son aktif yönetici pasifleştirilemez (409, yukarıdaki mesaj).
  - İş yükü varsa `transfer_to` zorunlu (422 "Açık davaları ve görevleri devretmek için bir avukat seçin."); hedef aynı büroda aktif ve şifresini belirlemiş bir avukat olmalı, kendisi olamaz (422 "Devredilecek avukat geçersiz.").
  - Tek işlemde: açık davaların `assigned_lawyer_id`'si, bekleyen görevlerin `assigned_to`'su, emsallerin `reviewer_lawyer_id`'si ve yaklaşan takvim etkinliklerinin (bugün ya da sonra başlayan) `assignee_id`'si hedefe geçer; geçmiş etkinlikler kullanıcıda kalır. Kullanıcı `is_active=false`; `password_set_at` ileri alınır (eski oturumlar yeniden aktifleştirmede geri gelmez; davet bekleyen kullanıcıda boş kalır); kullanılmamış token'ları geçersizleşir. Yanıt: güncellenmiş kullanıcı + devredilen sayılar `{ cases, tasks, precedents, events }`. Pasifleştirme penceresi yaklaşan etkinlikleri "<n> yaklaşan takvim etkinliği" olarak listeler.
- `POST /admin/users/{id}/activate` → tekrar aktif.
- Atama kuralı: dava, görev (`assigned_to`) ve takvim etkinliği (`assignee_id`) yalnızca büronun aktif ve şifresini belirlemiş kullanıcısına atanabilir; davet bekleyen ya da pasif kullanıcı → 422 "Seçilen kullanıcı atanamaz." (başka büronun kullanıcısı 404). Görev ve etkinlikte yalnızca atanan kişi değiştiğinde denetlenir; atananı sonradan pasifleşmiş bir kaydın diğer alanları düzenlenebilir. `import_cases --lawyer` için de aynı kural (aktif, şifresini belirlemiş avukat) geçerlidir.

### 5.2 Kimlik (`/auth`)
- `POST /auth/forgot-password` `{ email }` → her durumda 202 ve aynı mesaj; kullanıcı aktif ve şifresi belirlenmişse sıfırlama e-postası gider. Hız sınırı: aynı e-posta + IP için dakikada 3, aşılırsa 429 (Türkçe).
- `GET /auth/token-info?token=…` → `{ purpose, email, full_name }` ya da 410 "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.".
- `POST /auth/set-password` `{ token, password }` → token geçerliyse şifreyi belirler, `password_set_at`'i günceller, token'ı kullanılmış yapar, yeni erişim token'ı döndürür (otomatik giriş). Geçersiz/süresi dolmuş/kullanılmış → 410 (aynı mesaj). Pasif kullanıcı → 410.
- `POST /auth/change-password` `{ current_password, new_password }` (giriş yapmış kullanıcı) → mevcut şifre yanlışsa 400 "Mevcut şifre hatalı."; başarıda yeni erişim token'ı döner (diğer oturumlar kapanır).
- `POST /auth/login`: davet bekleyen kullanıcı → 401 (genel mesaj). Bilinmeyen, pasif ya da davet bekleyen hesapta da sabit bir bcrypt özetine karşı şifre doğrulaması yapılır; yanıt süresi hangi e-postaların kayıtlı olduğunu ele vermez. Mevcut İngilizce mesajlar Türkçeleştirilir: "E-posta veya şifre hatalı.", "Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.".
- `POST /auth/logout` mevcut kalır.

### 5.3 Profil
- `PATCH /users/me` `{ full_name?, department? }` → güncellenmiş kullanıcı.

## 6. E-postalar
- Mevcut e-posta katmanı (console/SMTP, Mailpit). Türkçe, düz metin + basit HTML.
  - Davet: konu "CaseBridge davetiniz — <büro adı>"; gövde: davet eden, büro, "Şifrenizi belirleyin" bağlantısı, geçerlilik (72 saat).
  - Sıfırlama: konu "CaseBridge şifre sıfırlama"; bağlantı, geçerlilik (1 saat), "Bu isteği siz yapmadıysanız dikkate almayın."
- Bağlantı: `{FRONTEND_BASE_URL}/sifre-belirle?token=<token>` (yeni ayar `FRONTEND_BASE_URL`; verilmezse `APP_BASE_URL`, o da verilmezse `http://localhost:3000`).
- E-posta gönderilemezse işlem başarısız sayılmaz: kullanıcı/token oluşur, yanıtta `email_sent: false` döner ve yönetici "Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz." uyarısı görür.
- Token'lar, şifreler ve bağlantılar loglanmaz (console backend'in e-postayı yazdırması hariç — bu yalnızca geliştirme modudur ve mevcut davranıştır).

## 7. Arayüz

### 7.1 Ayarlar > Kullanıcılar (yönetici)
- Mevcut salt okunur liste yerine tablo: Ad, E-posta, Departman, Rol, Durum ("Aktif" / "Davet bekliyor" / "Pasif"), işlemler menüsü.
- "Kullanıcı ekle" → modal (Ad soyad*, E-posta*, Departman, Rol* — Avukat/Yönetici) → kaydet → "Davet gönderildi." bildirimi.
- Satır işlemleri: Düzenle (modal), Daveti yeniden gönder (davet bekleyende), Şifre sıfırlama bağlantısı gönder (aktifte), Pasifleştir, Aktifleştir (pasifte).
- Pasifleştir modalı: iş yükünü getirir; açık dava/görev/emsal yoksa "Pasifleştir" onayı; varsa liste + "Devredilecek avukat" seçimi (aktif avukatlar, kendisi hariç) zorunlu → "Devret ve pasifleştir".
- Kendi satırında Pasifleştir ve rol değişikliği gösterilmez. Hata mesajları backend'in Türkçe detayından; diğer hatalar Türkçe genel mesaj.

### 7.2 Kimlik sayfaları
- Giriş: boş form; "Şifremi unuttum" bağlantısı; demo modunda "Demo hesapları" ipucu.
- `/sifremi-unuttum`: e-posta → "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi."
- `/sifre-belirle?token=…`: token bilgisi yüklenir ("Merhaba <ad>, CaseBridge şifrenizi belirleyin."); Yeni şifre + Yeni şifre (tekrar), kural ipucu; başarıda otomatik giriş ve role göre yönlendirme (`/admin` veya `/dashboard`). Süresi dolmuş/kullanılmış bağlantı: açıklama + "Giriş sayfasına dön" (ve "Şifremi unuttum" bağlantısı).
- Bu üç sayfa giriş gerektirmez (AppShell dışında).

### 7.3 Hesap ve çıkış
- Üst başlıkta kullanıcı menüsü: ad soyad + rol; "Hesabım", "Çıkış yap".
- "Çıkış yap": `POST /auth/logout`, token silinir, `/login`'e yönlenir.
- `/hesabim`: ad ve departman düzenleme; "Şifre değiştir" (mevcut, yeni, yeni tekrar). Başarıda yeni token saklanır, "Şifreniz değiştirildi." bildirimi.

## 8. E2E
- `tests/e2e/specs/helpers.ts` `login()`: giriş sonrası `/dashboard` **veya** `/admin` kabul edilir (ya da role göre beklenen URL parametresi). 02–05 yeniden geçmeli.
- E-posta yakalama: e-posta katmanına `EMAIL_BACKEND=file` seçeneği eklenir; her ileti `EMAIL_FILE_DIR` (varsayılan `./var/mail`) altına ayrı bir `.eml` dosyası olarak yazılır. E2E sunucusu bu backend ile çalışır ve test, alıcıya giden en son iletiden bağlantıyı okur. Uygulamaya test amaçlı HTTP ucu eklenmez.
- Yeni senaryo: yönetici avukat ekler → davet bağlantısı e-posta dosyasından okunur → şifre belirlenir → otomatik giriş → çıkış → yeni şifreyle giriş. Pasifleştirme: iş yükü olan avukat devirle pasifleştirilir, giriş yapamaz.
- Giriş hız sınırı (kullanıcı başına dakikada 5) dikkate alınır.

## 9. Test (backend + frontend)
- Token: üretim, özetin saklanması, süre dolması, tek kullanım, yeni token'ın eskiyi geçersizleştirmesi.
- Davet/sıfırlama akışları; davet bekleyenin girememesi; `forgot-password`'ün her durumda aynı yanıtı ve hız sınırı; `token-info`/`set-password` 410 durumları; şifre kuralı.
- Şifre değişince eski JWT'nin 401 alması; `pwd` iddiası olmayan eski token'ların davranışı (reddedilir → yeniden giriş).
- Yönetici korumaları (kendini/son yöneticiyi), büro izolasyonu, 403 (avukat), e-posta çakışması.
- Pasifleştirme: iş yükü varken `transfer_to` zorunlu, geçersiz hedef, devrin dava/görev/emsalleri taşıması, token'ların geçersizleşmesi, tekrar aktifleştirme.
- `create_admin` komutu ve `SEED_DEMO_DATA=false` iken demo kullanıcı olmaması.
- Frontend: kullanıcılar sekmesi ve modallar, şifre belirleme/şifremi unuttum/hesabım sayfaları, kullanıcı menüsü ve çıkış, giriş formunun boş gelmesi ve demo ipucu.
