# CaseBridge Kurulum Kılavuzu

Son güncelleme: 30 Ekim 2026

## Genel bakış

CaseBridge bulutta tek bir kurulum olarak çalışır ve birçok hukuk bürosuna hizmet verir. Büro başına ayrı kurulum yapılmaz. Kurulum bir kez yapılır, sonra her büro arayüzden açılır.

Sistemde üç rol vardır:

| Rol | Kim | Ne yapar | Nerede |
| --- | --- | --- | --- |
| Platform yöneticisi | CaseBridge ekibi | Büro ve ilk yöneticisini açar, ek yönetici ekler, daveti yeniden gönderir, büroyu askıya alır | `/platform` (Büro Yönetimi) |
| Büro yöneticisi | Büronun sorumlusu | Kendi bürosunun kullanıcılarını davet eder, davaları atar | `/admin`, Ayarlar > Kullanıcılar |
| Avukat | Büro çalışanı | Davaları, görevleri, belgeleri yönetir | `/dashboard` |

Bürolar birbirini göremez. Platform yöneticileri de müşteri bürolarının dava verisine erişemez. Kimse kendi kendine kayıt olamaz: her hesap bir davet e-postasıyla başlar, kişi şifresini o bağlantıdan kendisi belirler.

## Gereksinimler

Kurulum için Docker ve git yeterlidir. Yerel yapay zekâ modeli kullanılacaksa Ollama da gerekir.

- **Docker Desktop** (veya Docker Engine + Compose eklentisi)
- **git** ve depoya erişim: `git@github.com:Phoneria/CaseBridge.git`
- **Ollama** (isteğe bağlı): gerçek yerel duruşma modeli için `qwen3.5:9b`. `LLM_PROVIDER=mock` ile model olmadan çalışır.
- **Boş portlar**: 3000 (arayüz), 8000 (API), 5432 (PostgreSQL), 8025 ve 1025 (Mailpit)

## Ortam ayarları (.env)

Ayarlar proje kökündeki `.env` dosyasında durur. Dosya yoksa örnekten kopyalayın. `.env` asla git'e eklenmez.

```bash
cp .env.example .env
```

| Ayar | Yerel / demo | Canlı sunucu | Ne işe yarar |
| --- | --- | --- | --- |
| `JWT_SECRET` | uzun rastgele değer | uzun rastgele değer, gizli | Oturum anahtarlarını imzalar. Üretmek için: `openssl rand -hex 32` |
| `PLATFORM_ADMIN_EMAILS` | kendi e-postanız | ekibinizin e-postaları (virgülle) | Platform yöneticisi hesapları açılışta bundan oluşur. Hiçbir büroda kayıtlı olmayan adres yazın. |
| `SEED_DEMO_DATA` | `true` (örnek büro ve davalar) | `false` | `false` iken demo büro ve kullanıcı oluşmaz. |
| `ENV` | `development` | `production` | `production` iken demo platform hesabı hiç oluşmaz. Tam bu yazımla girin. |
| `LLM_PROVIDER` | `mock` veya `ollama` | `ollama`, `openai` veya `qwen` | Yapay zekâ özellikleri. `openai` ve `qwen` API anahtarı ister. |
| `FRONTEND_BASE_URL` | boş bırakılabilir | sitenin genel adresi | Davet ve şifre bağlantıları bu adrese götürür. |
| `SMTP_*`, `EMAIL_BACKEND` | Docker'da Mailpit kullanılır | gerçek SMTP bilgileri | Davet, şifre sıfırlama ve hatırlatma e-postaları. |
| `INVITE_TOKEN_HOURS` | 72 | 72 | Davet bağlantısının geçerlilik süresi (saat). |

## Docker ile kurulum

Tek komut tüm servisleri kurar ve başlatır. Veritabanı güncellemesi ve seed her açılışta kendiliğinden çalışır.

1. Kodu alın:

   ```bash
   git clone git@github.com:Phoneria/CaseBridge.git && cd CaseBridge
   ```
2. `.env` dosyasını hazırlayın (yukarıdaki tablo).
3. Yerel model kullanacaksanız Ollama'yı hazırlayın:

   ```bash
   ollama pull qwen3.5:9b
   ollama serve
   ```
4. İmajları derleyip başlatın:

   ```bash
   docker compose up -d --build
   ```

Başlayan servisler:

| Servis | Adres | Açıklama |
| --- | --- | --- |
| Arayüz | http://localhost:3000 | Kullanıcıların giriş yaptığı site |
| API | http://localhost:8000 | Açılışta migration ve seed çalıştırır |
| PostgreSQL | localhost:5432 | Veriler `casebridge_pgdata` volume'ünde kalır |
| Mailpit | http://localhost:8025 | Uygulamanın gönderdiği tüm e-postalar burada görünür |

Yeniden başlatmalar veriyi çoğaltmaz. Migration ve seed tekrar çalıştırılmaya uygundur.

## İlk giriş ve ilk büro

Kurulumdan sonra sıra hep aynıdır: önce siz platform yöneticisi olursunuz, sonra büroyu açarsınız, büro yöneticisi de avukatlarını davet eder.

1. **Platform yöneticisi olun.** Mailpit'te (http://localhost:8025) "CaseBridge davetiniz" e-postasını açın. Bağlantıya tıklayıp şifrenizi belirleyin. Sistem sizi `/platform` sayfasına götürür.
2. **Büroyu açın.** Büro Yönetimi > Yeni büro'da büro adını, yöneticinin adını ve e-postasını girin. Aynı adda ikinci bir büro açılamaz.
3. **Büro yöneticisi daveti kabul eder.** Davet e-postası Mailpit'e düşer. Yönetici şifresini belirleyince Admin Paneli'ne (`/admin`) girer.
4. **Avukatlar davet edilir.** Büro yöneticisi Ayarlar > Kullanıcılar'dan avukatları ekler. Her avukat da kendi davetinden şifresini belirler.

Davet e-postası gönderilemezse kayıt yine oluşur ve ekranda uyarı çıkar. Daveti büronun panelinden "Daveti yeniden gönder" ile tekrar gönderebilirsiniz.

`SEED_DEMO_DATA=true` ile kurulduysa hazır demo hesapları da vardır. Hepsinin şifresi `demo1234`:

| Hesap | Rol |
| --- | --- |
| `admin@demo.casebridge.dev` | Demo Hukuk Bürosu yöneticisi |
| `avukat@demo.casebridge.dev` | Demo avukat |
| `platform@demo.casebridge.dev` | Platform yöneticisi; `ENV=production` iken oluşmaz |

## Tam sıfırlama

Sıfırlama tüm büroları, kullanıcıları, davaları, yüklenen belgeleri ve yapay zekâ sonuçlarını kalıcı olarak siler. Bu işlem geri alınamaz.

1. Container'ları ve veri volume'lerini silin:

   ```bash
   docker compose down -v
   ```
2. Çalıştırmak istediğiniz koda geçin (`git pull` veya ilgili dal).
3. `.env` dosyasını gözden geçirin: `PLATFORM_ADMIN_EMAILS`, `SEED_DEMO_DATA`, `ENV`.
4. Yeniden derleyip başlatın:

   ```bash
   docker compose up -d --build
   ```
5. "İlk giriş ve ilk büro" adımlarıyla devam edin.

Veriyi korumak istiyorsanız `-v` olmadan `docker compose down` kullanın. Bu durumda yalnızca container'lar silinir.

Docker'sız geliştirme kurulumunda sıfırlama için `backend/casebridge.db` dosyasını ve `backend/storage/` klasörünü silin. Ardından `alembic upgrade head` ve `python -m app.db.seed` komutlarını çalıştırın.

## Mevcut kurulumu güncelleme

Yeni kodu almak verileri silmez. Veritabanı açılışta kendiliğinden güncellenir.

```bash
git pull
docker compose up -d --build
```

Mevcut bürolar ve kullanıcılar olduğu gibi çalışmaya devam eder. Eski `python -m app.db.create_admin` komutu kaldırıldı; yeni bürolar `/platform` panelinden açılır. Henüz platform yöneticiniz yoksa `.env` dosyasına `PLATFORM_ADMIN_EMAILS` ekleyip yeniden başlatın ve gelen daveti kabul edin.

## Canlı ortam kontrol listesi

Gerçek sunucuya almadan önce bu maddelerin hepsi işaretlenmiş olmalı.

- [ ] `ENV=production` (tam bu yazımla)
- [ ] `SEED_DEMO_DATA=false`
- [ ] `JWT_SECRET` uzun, rastgele ve yalnızca sunucuda
- [ ] `PLATFORM_ADMIN_EMAILS` yalnızca CaseBridge ekibinin adresleri
- [ ] Gerçek SMTP ayarları girildi; Mailpit kullanılmıyor
- [ ] `FRONTEND_BASE_URL` sitenin genel adresi (davet bağlantıları için)
- [ ] PostgreSQL şifresi docker-compose'daki varsayılandan farklı ve 5432 portu dışarıya kapalı
- [ ] CORS'a sitenin adresi eklendi (`EXTRA_CORS_ORIGINS`)
- [ ] `npm audit` uyarıları gözden geçirildi
- [ ] Veritabanı ve `casebridge_storage` volume'ü için yedekleme kuruldu

## Sorun giderme

Çoğu sorunun cevabı API logundadır:

```bash
docker compose logs -f backend
```

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Platform daveti gelmiyor; logda "1. adres bir müşteri bürosunda kayıtlı olduğu için atlandı" | Adres zaten bir büroda kullanılıyor | `PLATFORM_ADMIN_EMAILS` için başka bir adres yazın, `docker compose restart backend` |
| Logda "adres geçersiz olduğu için atlandı" | E-posta yazım hatası | Ayarı düzeltip yeniden başlatın |
| Davet bağlantısı "süresi dolmuş" diyor | 72 saat geçti veya bağlantı kullanıldı | Platform yöneticisi için: backend'i yeniden başlatın, yeni davet gider. Büro yöneticisi için: panelden "Daveti yeniden gönder" |
| Girişte "Büronuzun erişimi askıya alındı." | Büro askıya alınmış | Platform panelinden büroyu aktifleştirin |
| E-posta hiç görünmüyor | Mailpit çalışmıyor ya da SMTP ayarı hatalı | http://localhost:8025 açılıyor mu bakın; canlıda `SMTP_*` ayarlarını kontrol edin |
| Arayüz API'ye ulaşamıyor | API başlamadı veya CORS izni yok | `docker compose ps` ve backend logu; canlıda `EXTRA_CORS_ORIGINS` |
