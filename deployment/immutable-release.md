# Main kaynaklı, elle başlatılan değişmez yayın

Bu düzen GitHub `Phoneria/CaseBridge` main kaynağını kullanır. Otomatik yayın tetikleyicisi veya yayın sıklığı seçilmedi; CI yalnız doğrulama yapar. Uygulama ve tanıtım sürümleri bağımsızdır. Ön yüz sürümü tam uygulama kaynaklarından **yerelde, commit öncesinde** hazırlanır; sunucuda sürüm veya kaynak dosyası değiştirilmez.

## Yetki ve veri sınırları

- `root` ve mevcut `izzet` yöneticisi olağanüstü kurtarma erişimini korur. Tam yetkili bir yöneticinin sistemi aşması mutlak olarak engellenemez. Kalıcı kod değişikliği main üzerinden yapılır; acil müdahale ayrıca kaydedilir ve main ile uzlaştırılır.
- Mevcut `proje-agent` hesabı normal kullanıcıdır; kod, release envanteri ve Docker üzerinde yazma/çalıştırma hakkı yoktur. Mevcut kullanıcıların SSH/sudo hakları bu kurulumla kaldırılmaz.
- Yeni `cb-release` sistem rolünün interaktif kabuğu, genel sudo veya Docker grubu yoktur. Tek sudo hakkı root'a ait `/usr/local/sbin/casebridge-release` komutudur. Komut yalnız tanımlı işlem, tam commit ve kapsam kabul eder; kullanıcıdan yol, Compose dosyası, ortam değişkeni veya kabuk komutu kabul etmez. `python -I` ve sabit alt süreç ortamı kullanılır. Ayrı bir genel build veya Docker kabuğu verilmez: kaynak seçme/build ve etkinleştirme ayrı komutlardır; root denetimli sabit uygulama içinde kalır.
- Kaynak `/opt/casebridge`; root'a ait değişmez envanter `/opt/casebridge-releases/<SHA>`; korumalı günlükler `/var/log/casebridge-release`. Kaynak arşivi Git'ten çıkar; symbolic link, path traversal ve cihaz reddedilir. Dosya hash'leri, imaj ID'leri ve çalışan kod doğrulanır.
- Sırlar yalnız `/etc/casebridge/production.env` ve mevcut korumalı kurtarma düzenindedir. İçeriğini yazdırmayın. Veritabanı ve şifreli anahtar sürümleri `pgdata`, yüklenen belgeler `storage` volume'undadır. Anahtar/şifreleme sırrı sürüme katılmaz, imaja konmaz, müşteri tarayıcısında saklanmaz. Kod geri alma veri/anahtar veya şema geri alma değildir.
- Backend salt okunur kökte çalışır; mevcut şifreli belge deposu sahipliğini bozmamak için UID değişmez. Yalnız `/app/storage` ve `/tmp` yazılabilir. Frontend UID 1000, salt okunur kök ve yalnız geçici `/tmp`/Next cache kullanır. İki serviste tüm Linux capabilities düşürülür, `no-new-privileges` kullanılır. Kod için yazılabilir bind mount yoktur.
- Tanıtımda Caddy'nin mevcut host bind dizini sabit kalır. Bunun içindeki root'a ait `releases/<SHA>` salt okunurdur; `current` relative symlink atomik değiştirilir. Başka bir servisin Caddy bloğu veya container'ı değiştirilmez.

## İlk kurulum (mevcut yönetici)

Önce testleri, todo müşteri-release kapılarını ve `install-release.py --dry-run` sonucunu inceleyin. Main'e alınmış tam commit'i sabitleyin. GitHub main'den iki dosyanın aynı baytlarını root'a ait geçici dizine çıkarın; yüklenen dosya veya serbest checkout sürümünü çalıştırmayın. Kurulum da dosyaları seçili güncel `origin/main` ile bayt bazında karşılaştırır.

```sh
python3 /ROOT_OWNED_REVIEWED_DIR/install-release.py --dry-run
python3 /ROOT_OWNED_REVIEWED_DIR/install-release.py --main-commit FULL_MAIN_SHA
```

Bootstrap mevcut temiz main checkout, çalışan backend kaynakları, frontend'in public JS/CSS hash'leri ve mevcut tanıtım dosyalarını karşılaştırır. Önceki imajları yalıtılmış, ağsız ve salt okunur canary ile çalıştırır. Doğrulanmış mevcut sürümü geri dönüş envanterine kaydeder. Paylaşılan Caddy dosyasının inode'unu koruyup yalnız CaseBridge root'unu `/srv/casebridge/current` yapar; validate/reload/public kontrol başarısızsa Caddy yedeğini geri yükler. Önceki admin erişimleri aynı kalır. Yarım bootstrap envanteri varsa otomatik silinmez; yönetici incelemesinden sonra yeniden denenir.

## Yeni yayın

```sh
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release stage FULL_MAIN_SHA all
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release activate FULL_MAIN_SHA
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release verify FULL_MAIN_SHA
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release status
```

`app`, `marketing` veya `all` kapsamı stage sırasında sabitlenir. Stage yalnız fetch edilen güncel main tip'ini kabul eder. Kaynak, dosya hash manifesti, değişmez imaj ID'leri, frontend varlık hash'leri ve sürümler birlikte kaydedilir. Canary üretim sırrına, verisine veya ağına erişmez; sentetik SQLite health/auth ve gerçek frontend HTTP kontrolü yapar. Normal/runtime kod yazma denemeleri başarısız olmalıdır. Önceki doğrulanmış uygulamayla aynı build girdileri olan imaj yeniden kullanılır; yalnız ön yüz değişmişse backend ve DB yeniden başlatılmaz. Her imajın gerçek kaynak commit'i ayrıca tutulur; değiştirilmemiş backend'in health commit'i önceki doğrulanmış commit olarak kalabilir.

Activate önce hâlen sunulan kodu/public varlıkları son doğrulanmış sürümle karşılaştırır; beklenmedik fark varsa değişiklikten önce durur. İmajı yeniden build etmez/pull etmez. Başarılı yayın; `/release.json`, `/api/health`, tüm derlenmiş frontend JS/CSS, çalışan backend/frontend kod hash'leri, container hardening ve tanıtım manifestiyle kanıtlanır. Compose veya public kontrol başarısızsa bir kez önceki doğrulanmış uygulama/tanıtım artefaktlarını geri getirir. Eşzamanlı yayın işlemleri kilitlenir. Korumalı build logları terminale veya müşteri yanıtına dökülmez.

## Geri alma ve kurtarma

```sh
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release rollback PREVIOUS_VERIFIED_SHA
sudo -u cb-release sudo -n /usr/local/sbin/casebridge-release verify PREVIOUS_VERIFIED_SHA
```

Yalnız daha önce doğrulanmış main artefaktı seçilebilir; eski imaj/manifest korunur. İmaj yeniden build edilmez, main force push yapılmaz, sunucu dosyası yamalanmaz. Bu sürüm şema değişikliği içermez. İleride uyumsuz migration varsa yayın öncesinde ayrı veri yedeği/geri alma planı zorunludur; yalnız kod rollback komutu yeterli sayılmaz.

Yalıtılmış gerçek imaj geri dönüş provası: ana kaynakta bulunan `test-rollback.py PREVIOUS_VERIFIED_SHA CANDIDATE_SHA`, önceki → aday → önceki imajları ağsız canary içinde çalıştırır; sentetik backend health/auth, frontend HTTP ve salt okunur kod yazma reddini denetler. Üretim servislerini değiştirmez.

Normal işletim `cb-release` üzerinden yapılır. İnsan operatörlere ayrı SSH kimliği verilmesi veya mevcut tam yetkili yöneticinin sınırlandırılması ayrı erişim kararıdır; bu kurulum böyle bir değişiklik yapmaz. Yönetici kilitleyecek veya yıkıcı bir değişiklik istenirse önce somut erişim/kurtarma önerisi kullanıcıya sunulur.
