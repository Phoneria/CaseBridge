# CaseBridge — Natro + Hetzner yayın ve ajan devir rehberi

Hazırlanma: 31 Ekim 2026; aynı gün `main` dalındaki güncel koda göre düzenlendi (platform paneli, e-posta ile davet, OpenAI).

Bu belge bir kurulum planı ve komut rehberidir. Yayın dosyaları (`deployment/compose.production.yml`, `deployment/Caddyfile.app-block`, `deployment/production.env.example`) repoda hazırdır. Panel menüleri zamanla değişebilir; resmi bağlantılar en sonda bulunur.

## 0. Bu kurulumun gerçek durumu (31 Ekim 2026 incelemesi)

CaseBridge **ayrı bir sunucuya değil**, Autosense ile ortak kullanılan mevcut Hetzner sunucusuna kurulur. Aşağıdaki bölümlerdeki genel adımlardan bu sunucu için geçerli olanlar bu tabloda özetlenmiştir. Çelişki olursa bu bölüm esas alınır.

| Konu | Durum |
| --- | --- |
| DNS | `casebridge.com.tr` için NS kayıtları Hetzner'i gösteriyor (`hydrogen/oxygen.ns.hetzner.com`, `helium.ns.hetzner.de`). Zone, Hetzner Console'da **Autosense** projesinin DNS bölümünde. Natro yalnızca alan adının kayıt şirketi; **Natro'da değişiklik gerekmez** (bölüm 5 atlanır). `app` için A kaydı Hetzner DNS'e eklenir. |
| Mevcut kayıtlar | A `@` ve `www` → `49.13.139.19`. MX `smtp.google.com` (Google Workspace). TXT `@` ve `google._domainkey` (SPF/DKIM). Hiçbiri değiştirilmez. |
| Sunucu | Autosense projesindeki `ubuntu-8gb-fsn1-1`: CX33 (4 vCPU, 8 GB RAM, 80 GB disk), Falkenstein, IPv4 `49.13.139.19`, Ubuntu 26.04 LTS. Bölüm 6'daki sunucu oluşturma ve bölüm 9'daki Docker kurulumu **atlanır**; Docker zaten kurulu. |
| Çalışan servisler | `/opt/autosense-b2c` içindeki Autosense stack'i: `autosense-b2c-web-1` (Caddy; 80/443), `-backend-1`, `-postgres-1`, `-redis-1`. Ana tanıtım sitesi aynı Caddy'den, `/opt/casebridge-source/web-page` klasöründen yayınlanır. |
| HTTPS | Autosense'in Caddy'si 80/443'ü kullandığı için CaseBridge kendi Caddy'sini **çalıştırmaz**. `app.casebridge.com.tr` bloğu (`deployment/Caddyfile.app-block`) Autosense'in Caddyfile'ına (`/opt/autosense-b2c/deploy/Caddyfile`) eklenir ve Caddy yeniden yüklenir (bölüm 14.2). |
| Docker ağı | `cb-frontend` ve `cb-backend`, Caddy'nin onlara ulaşabilmesi için Autosense'in `autosense-b2c_default` ağına katılır. Veritabanı (`cb-db`) yalnızca CaseBridge'in iç ağındadır. Servis adlarındaki `cb-` öneki zorunludur: Autosense'in Caddy'si o ağda `backend` adını arar. |
| SSH | `root` için yalnızca anahtarla giriş açık (`PermitRootLogin prohibit-password`). `PasswordAuthentication yes` ayarı diğer kullanıcılar için kapatılmalı. Operatör anahtarı: `~/.ssh/casebridge_hetzner`. Sunucu parmak izi: `SHA256:eNaBaQ+Z+YxqmUJR365SjyNkioCMoJZk/MrD0DeudrY`. |
| E-posta | Google Workspace SMTP: `smtp.gmail.com:587`, gönderen hesap için uygulama şifresi. SPF/DKIM zaten kurulu. |
| Diğer | `127.0.0.1:8080` üzerinde 4 gündür çalışan bir `python3 -m http.server` var (yalnızca yerel). CaseBridge ile ilgisi yok; sahibine sorulmadan kapatılmaz. |

**Autosense'i korumak için:**
- `/opt/autosense-b2c` içinde yalnızca Caddyfile'a blok eklenir. Autosense'in compose dosyası, container'ları ve volume'ları değiştirilmez.
- `docker compose down`, `docker system prune` ve `docker volume prune` çalıştırılmaz.
- Caddy yeniden **başlatılmaz**; yeni ayar `caddy reload` ile kesintisiz yüklenir.

## 1. Ne yapıyoruz?

Hedef kullanıcı deneyimi:

```text
Kullanıcı → https://casebridge.com.tr
                        │
                   “Başla” butonu
                        │
                        ▼
          https://app.casebridge.com.tr/login
                        │
                  Kullanıcı girişi
                        │
                        ▼
                 CaseBridge uygulaması
```

GitHub, uygulamanın kaynak kodunu saklar. Kullanıcıyı GitHub sayfasına göndermiyoruz. Kodu Hetzner'deki sunucuya indirip çalıştırıyoruz. Kullanıcı çalışan uygulamaya tarayıcıyla erişiyor.

Ana tanıtım sitesi mevcut yerinde kalacak. Domain'i başka şirkete taşımamız veya ana sitenin sunucusunu değiştirmemiz gerekmiyor. Sadece `app` alt alan adını yeni sunucuya yönlendireceğiz ve mevcut tanıtım sitesine bağlantı ekleyeceğiz.

## 2. Kavramlar: Natro, Hetzner ve GitHub'ın görevleri

| Kavram / servis | Görevi | Burada yapacağımız işlem |
| --- | --- | --- |
| Domain / alan adı | `casebridge.com.tr` gibi internet adresi | Mevcut domain'i kullanmak |
| Natro | Domain, DNS ve/veya hosting hizmeti verebilir | Hesapta domain ve DNS durumunu kontrol etmek |
| DNS | Alan adını sunucu IP adresine bağlar | `app` için A kaydı eklemek |
| Nameserver / NS | Hangi şirketin DNS kayıtlarının geçerli olduğunu söyler | Önce gerçek DNS yöneticisini bulmak |
| Hetzner Cloud | İnternette sürekli açık sanal sunucu sağlar | Linux sunucu kiralamak |
| SSH | Sunucunun terminaline güvenli erişim | Sunucuya bağlanmak |
| GitHub | Kodun sürümlerini saklar | Onaylanan branch/commit'i sunucuya almak |
| Docker Compose | Birden fazla uygulama servisini birlikte çalıştırır | Arayüz, API, veritabanı ve proxy'yi yönetmek |
| Caddy | İstekleri doğru servise iletir; HTTPS sertifikasını yönetir | Domain üzerinden güvenli erişim sağlamak |
| PostgreSQL | Kullanıcı ve dava kayıtlarını saklar | Kalıcı veritabanı oluşturmak |
| Volume | Container silinse bile veriyi saklayan Docker alanı | Veritabanını ve yüklenen dosyaları korumak |

**Natro'ya girmek ile sunucuya bağlanmak farklı işlemler.** Natro'ya tarayıcıdan müşteri hesabıyla girilir; Hetzner sunucusuna terminalden SSH ile bağlanılır. Natro ve Hetzner arasında özel bir “bağla” düğmesi yoktur: DNS kaydına Hetzner sunucusunun IP'sini yazarız.

## 3. Başlamadan önce doldurulacak bilgiler

Bu tabloya parola veya gizli anahtar yazmayın. Bunları parola yöneticisinde saklayın.

| Bilgi | Doldurulacak değer |
| --- | --- |
| Domain hesabının sahibi | … |
| Natro hesabına erişimi olan kişi | … |
| Gerçek DNS sağlayıcısı / NS kayıtları | … |
| Ana sitenin altyapısı: WordPress, NatroSite, özel kod vb. | … |
| Ana sitenin yönetim / kod erişimi | … |
| Hetzner hesap ve faturalandırma sahibi | … |
| Sunucu bölgesi ve planı | … |
| Sunucunun genel IPv4 adresi | … |
| GitHub deposu | `https://github.com/Phoneria/CaseBridge` |
| Yayına çıkacak branch | `main` |
| Yayına çıkacak commit SHA | … |
| Yapay zekâ modu | OpenAI (API anahtarı ve harcama sınırı hesap sahibinde) |
| SMTP sağlayıcısı ve gönderen adresi | … |
| Platform yöneticisi e-posta(lar)ı (`PLATFORM_ADMIN_EMAILS`) | … |
| İlk büronun adı ve yöneticisinin e-postası | … |
| Yedeklerin saklanacağı ayrı konum | … |
| Kurulum ve bakım sorumlusu | … |

Maliyet kalemleri: sunucu, varsa IPv4, sunucu yedekleri, ayrı yedek depolama ve gerçek model kullanılıyorsa AI hizmeti. Güncel tutarı satın alma ekranında kontrol edin. Bu rehber sabit fiyat veya kapasite garantisi vermez.

## 4. Bu projede doğrulanan durum ve yayın sınırı

Güncel kodda (`main`) doğrulanan yapı:

- Arayüz: Next.js; `frontend/`. API: FastAPI; `backend/`. Veritabanı: PostgreSQL 16.
- API sağlık adresi: `/health`. Giriş ekranı: `/login`; giriş servisi: `/auth/login`.
- Arayüz API adresi `NEXT_PUBLIC_API_URL` ile **build sırasında** belirlenir. Bu kurulumda değeri `https://app.casebridge.com.tr/api` olur.
- **Kendi kendine kayıt yoktur.** CaseBridge birçok büroya hizmet veren tek bir bulut kurulumudur:
  - CaseBridge ekibinin platform yöneticileri `PLATFORM_ADMIN_EMAILS` ayarından açılışta oluşur ve e-postayla davet alır.
  - Platform yöneticileri büroları ve ilk yöneticilerini `/platform` panelinden açar.
  - Büro yöneticileri kendi avukatlarını Ayarlar > Kullanıcılar'dan davet eder.
  - Herkes şifresini e-postadaki bağlantıdan kendisi belirler. Bu yüzden canlıda **çalışan SMTP şarttır**.
- Simülasyon, duruşma ve hatırlatma işçileri API süreci içinde çalışır. **Tek backend container ve tek Uvicorn worker** kullanılır.
- Kök `docker-compose.yml` geliştirme/demo içindir: demo seed çalıştırır ve 5432/8000/3000 portlarını açar. Sunucuda yalnızca `deployment/compose.production.yml` kullanılır. Bu dosya:
  - seed çalıştırmaz,
  - `ENV=production` ve `SEED_DEMO_DATA=false` değerlerini zorlar,
  - dışarıya yalnızca Caddy'nin 80/443 portlarını açar.
- `ENV=production` iken demo platform hesabı hiç oluşmaz. Bu değer tek başına bütün güvenlik eksiklerini gidermez.

Yayından önce yapılan yerel doğrulama:

- `compose.production.yml` geçerli; dışarıya yalnızca 80/443 açılıyor.
- Frontend `/api` adresiyle derlendi.
- Caddyfile'daki `/api` önekini kaldıran yönlendirme bir proxy ile taklit edildi. Tarayıcı testinde:
  - bütün API çağrıları `/api/...` üzerinden gitti,
  - giriş ve dava listesi çalıştı,
  - demo platform hesabı oluşmadı.
- Container'lar bu ortamda Docker Hub'a erişilemediği için çalıştırılamadı. İlk gerçek çalıştırma sunucuda yapılacak.

Bu rehber önce **pilot kurulum** içindir. Gerçek dava/müvekkil verisiyle genel kullanıma açılmadan önce şunlar tamamlanmalıdır:

- bağımlılık güvenlik incelemesi,
- oturum yönetiminin gözden geçirilmesi,
- yedeğin geri yüklenerek test edilmesi.

Ana README'deki bilinen MVP sınırları hâlâ geçerlidir: JWT'nin localStorage'da tutulması, `/system/ai-status` uç noktasının rol kontrolü olmaması, yerel disk dosya saklama.

## 5. Natro'ya nasıl girilir?

**Bu bölüm kendi bilgisayarınızın tarayıcısında yapılır.**

1. [Natro resmi sitesini](https://www.natro.com/) açın.
2. “Müşteri Girişi”, “Hesabım” veya karşılık gelen hesap giriş bağlantısını kullanın.
3. Domain'in satın alındığı hesabın sahibi kendi bilgileriyle giriş yapsın. Varsa iki aşamalı doğrulamayı tamamlasın.
4. Giriş bilinmiyorsa resmi parola sıfırlama yolunu kullanın. Domain'in hangi hesaba kayıtlı olduğu bilinmiyorsa önce hesap sahibiyle çözün.
5. Alan adı yönetimi altında `casebridge.com.tr` kaydını bulun.
6. DNS sunucuları / Nameserver / NS bilgilerini kontrol edin ve mevcut DNS kayıtlarının ekran görüntüsünü ya da dışa aktarımını alın.

Natro'nun resmi yardımında DNS ekranı için şu yol tarif ediliyor: **Hesabım → Alan adı yönetimi → Aktif alan adları → Yönet → Profesyonel DNS**. Ürününüze göre panel farklı olabilir. [Natro DNS yardım sayfası](https://www.natro.com/hemendestek/bilgibankasi/natrositede-olusturdugum-web-sitemin-dns-yonetimini-nereden-gorebilirim-)

### 5.1. Domain Natro'da ama DNS başka yerde olabilir

Domain'in Natro'dan alınmış olması DNS'nin de Natro'da yönetildiğini kanıtlamaz. NS kayıtları Cloudflare veya başka sağlayıcıyı gösteriyorsa yeni kaydı **o sağlayıcının DNS paneline** ekleyin.

Kendi bilgisayarınızda kontrol:

```bash
dig NS casebridge.com.tr +short
dig A casebridge.com.tr +short
dig A www.casebridge.com.tr +short
dig MX casebridge.com.tr +short
```

Windows PowerShell alternatifi:

```powershell
Resolve-DnsName casebridge.com.tr -Type NS
Resolve-DnsName casebridge.com.tr -Type MX
```

Burada henüz değişiklik yapmayın. Mevcut `@`, `www`, MX ve TXT kayıtlarını koruyacağız. MX e-posta akışını; SPF/DKIM/DMARC gibi TXT kayıtları e-posta doğrulamasını etkileyebilir. **Sadece uygulama eklemek için nameserver'ları değiştirmeyin.**

## 6. Hetzner nedir, nasıl hesap ve sunucu açılır?

Hetzner Cloud, uygulamayı çalıştıracağımız Linux bilgisayarı kiraladığımız hizmettir. Bilgisayar sizin evinizde değil, veri merkezindedir. Kendi bilgisayarınız kapalı olsa da uygulama çalışır.

**Bu bölüm tarayıcıda yapılır.**

1. [Hetzner resmi sitesinden](https://www.hetzner.com/) hesap oluşturun veya mevcut hesaba girin.
2. İstenen hesap doğrulamasını ve ödeme bilgilerini tamamlayın. Bu adımları hesap sahibi yürütmeli.
3. [Hetzner Console](https://console.hetzner.com/) açın.
4. `CaseBridge` isimli bir proje oluşturun veya kullanılacak projeyi seçin.
5. Sonraki bölümde SSH anahtarı hazırlayın.
6. Projede **Servers → Add server** üzerinden yeni sunucu oluşturun.

Önerilen ilk pilot profili, uygulama ve AI API kullanımı için bir başlangıç tahminidir:

| Seçim | Başlangıç tercihi |
| --- | --- |
| İşletim sistemi | Ubuntu 24.04 LTS |
| Mimari | x86_64 / AMD64 |
| Kaynak | Yaklaşık 4 vCPU, 8 GB RAM; disk belge miktarına göre |
| Bölge | Ekip tarafından seçilen, kullanıcıya uygun Avrupa bölgesi |
| Ağ | Genel IPv4 etkin; bu rehber IPv4 üzerinden ilerler |
| SSH key | Kendi oluşturduğunuz public key |
| Sunucu adı | `casebridge-prod` |
| Backups | Maliyeti kontrol ederek etkinleştirin; ayrıca uygulama yedeği alın |

Bu profil yerel büyük dil modeli çalıştırma önerisi değildir. Ollama kullanılacaksa model boyutu, bellek, eşzamanlı kullanıcı ve kabul edilebilir yanıt süresi ayrıca ölçülmeli. Küçük CPU sunucuda gerçek AI performansı garanti edilemez. Plan adı ve fiyatı değişebileceği için satın alma ekranındaki güncel seçenekleri kullanın.

Sunucuyu oluşturduktan sonra panelde görünen **genel IPv4 adresini** kaydedin. Aşağıdaki `SUNUCU_IP` ifadelerini bu adresle değiştireceksiniz; bu ifade çalışır bir IP değildir.

## 7. SSH anahtarı oluşturmak ve sunucuya bağlanmak

### 7.1. Kendi bilgisayarında SSH anahtarı oluştur

macOS/Linux Terminal veya OpenSSH kurulu Windows PowerShell:

```bash
ssh-keygen -t ed25519 -C "casebridge-operator" -f ~/.ssh/casebridge_hetzner
```

Bir passphrase seçin. Dosya zaten varsa üzerine yazmayın; başka isim kullanın.

- `casebridge_hetzner`: private key; paylaşılmaz, GitHub'a yüklenmez.
- `casebridge_hetzner.pub`: public key; Hetzner'e eklenir.

Public key'i görüntüleyin:

```bash
cat ~/.ssh/casebridge_hetzner.pub
```

Windows'ta gerekirse `Get-Content "$HOME/.ssh/casebridge_hetzner.pub"` kullanın.

Public key satırının tamamını Hetzner sunucu oluşturma ekranındaki SSH key alanına ekleyip seçin. Console'a sonradan key eklemek mevcut sunucunun `authorized_keys` dosyasını kendiliğinden güncellemez.

### 7.2. İlk bağlantı

**Kendi bilgisayarınızda:**

```bash
ssh -i ~/.ssh/casebridge_hetzner root@SUNUCU_IP
```

İlk bağlantıda host fingerprint sorulur. Fingerprint'i Hetzner web konsolundan `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` ile karşılaştırıp doğrulayın; sonra kabul edin.

Bağlanınca terminal sunucuyu yönetir. `exit` sizi kendi bilgisayarınıza geri çıkarır. Parola yazarken karakterlerin görünmemesi normaldir.

### 7.3. Günlük kullanım için kullanıcı oluştur

**Sunucuda, ilk root oturumunda:**

```bash
apt update
apt upgrade -y
apt install -y sudo git curl ca-certificates openssl dnsutils
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
```

Root oturumunu açık bırakın. Kendi bilgisayarınızda **yeni terminal** açıp deneyin:

```bash
ssh -i ~/.ssh/casebridge_hetzner deploy@SUNUCU_IP
sudo whoami
```

Beklenen çıktı `root`. Başarılıysa bundan sonraki sunucu adımlarını `deploy` hesabıyla yapın. İlk erişim çalışmadan SSH ayarlarını kapatmayın. Ajan ayrıca `sshd -t` ile yapılandırmayı doğrulayarak anahtarlı girişin ardından parola ile SSH girişini ve root SSH girişini kapatmalı; ikinci oturumla bağlantıyı tekrar test etmelidir.

## 8. Güvenlik duvarı

Hetzner Console'da proje içinden **Firewalls → Create Firewall** açın ve sunucuya uygulayın.

| Yön | Protokol / port | Kaynak |
| --- | --- | --- |
| Gelen | TCP 22 | Yöneticinin genel IPv4 adresi `/32` ile; gerekirse yöneticinin IPv6'sı `/128` |
| Gelen | TCP 80 | İnternet, IPv4 ve IPv6 |
| Gelen | TCP 443 | İnternet, IPv4 ve IPv6 |

Yöneticinin IP'si değişirse 22 kuralını yeni IP ile güncelleyin. Çıkış trafiğini ilk kurulumda varsayılan izinli bırakın; GitHub, paket depoları, DNS, sertifika ve AI sağlayıcılarına erişim gerekir.

**3000, 8000, 5432 ve 11434 portlarını internete açmayın.** Aşağıdaki kurulumda yalnızca Caddy'nin 80/443 portları yayınlanır. Docker ile yayınlanan portlar bazı host firewall kurallarını aşabilir; sadece UFW'ye güvenerek açık veritabanı portu bırakmayın. [Docker firewall açıklaması](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)

## 9. Docker kurulumu

**Sunucuda, deploy kullanıcısıyla.** Bu adımlar temiz Ubuntu 24.04 içindir. Önceden Docker veya başka uygulamalar varsa ajanın önce mevcut kurulum ve portları incelemesi gerekir; çalışan sistemi körlemesine değiştirmeyin.

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Docker paket kaynağını ekleyin:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Kurun ve doğrulayın:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
```

Bu rehber `sudo docker` kullanır. `docker` grubuna üyelik sunucuda çok geniş yetki verir; sırf `sudo` yazmamak için rastgele kullanıcılara vermeyin. Resmi kurulum kaynağı: [Docker Engine / Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 10. GitHub'dan kodun doğru sürümünü almak

Önce proje sahibi, yereldeki değişikliklerin hangilerinin GitHub'a aktarılacağını ve yayın branch'ini netleştirsin. Arkadaşın yalnızca GitHub'dan çekerse commit edilmemiş yerel dosyalar gelmez.

### 10.1. Private repo erişimi

Sunucunun repoyu okuması için ayrı, salt okunur bir GitHub deploy key kullanabilirsiniz. **Kendi bilgisayarınızdan Hetzner'e bağlandığınız private key'i sunucuya kopyalamayın.**

**Sunucuda deploy kullanıcısıyla:**

```bash
ssh-keygen -t ed25519 -C "casebridge-server-readonly" -f ~/.ssh/casebridge_github
cat ~/.ssh/casebridge_github.pub
```

GitHub'da depo yöneticisi: **Repository → Settings → Deploy keys → Add deploy key**. Public key'i ekleyin; **Allow write access kapalı** kalsın. Repo politikasında deploy key yasaksa kurumun onaylı erişim yöntemini kullanın.

Sunucudaki `~/.ssh/config` dosyasına ekleyin; mevcut içeriği silmeyin:

```sshconfig
Host github-casebridge
    HostName github.com
    User git
    IdentityFile ~/.ssh/casebridge_github
    IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T git@github-casebridge
```

İlk bağlantıda GitHub'ın host fingerprint'ini resmi belgelerle doğrulayın. Başarı mesajında GitHub'ın shell erişimi vermediğini söylemesi normaldir. [GitHub resmi SSH fingerprint bilgileri](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)

### 10.2. Klonlama ve sürüm kaydı

```bash
sudo install -d -o deploy -g deploy /opt/casebridge
git clone git@github-casebridge:Phoneria/CaseBridge.git /opt/casebridge
cd /opt/casebridge
git fetch --prune origin
git branch -r
```

Yayın dalı `main`'dir:

```bash
git switch main
```

Ardından:

```bash
git pull --ff-only
git status --short
git rev-parse HEAD
git log -1 --oneline
```

Commit SHA'yı yayın kaydına yazın. `git status` değişiklik gösteriyorsa bunların kaynağını anlayın; `reset --hard` ile silmeyin. Ajan varsa `AGENTS.md` talimatlarını ve güncel README'yi okumalı, bu belgeyi yeni kodla karşılaştırmalıdır.

## 11. Sunucu mimarisi

```text
İnternet → 49.13.139.19 :443 → Autosense Caddy (autosense-b2c-web-1)
                                   │
        ┌──────────────────────────┼────────────────────────────┐
  Autosense alan adı     casebridge.com.tr, www      app.casebridge.com.tr
  (mevcut, değişmez)     (statik site, değişmez)     /api/* → cb-backend :8000
                                                      diğer  → cb-frontend :3000
                                                                   │
                                                          cb-db (PostgreSQL 16)

Kalıcı veriler: cb-prod_pgdata + cb-prod_storage volume'ları
```

Tarayıcı API'ye `https://app.casebridge.com.tr/api` üzerinden erişir. Caddy `/api` önekini kaldırır; örneğin dışarıdaki `/api/auth/login`, backend'de `/auth/login` olur. Böylece arayüz ve API aynı origin'de çalışır. Ayrı bir `api` DNS kaydı gerekmiyor.

Yapılandırma dosyaları repoda hazırdır; sunucuda yeniden yazmayın, repodaki hâliyle kullanın:

| Dosya | Ne yapar |
| --- | --- |
| `deployment/compose.production.yml` | Servisler: `cb-db`, `cb-backend`, `cb-frontend`; proje adı `cb-prod`. Backend migration'ları çalıştırıp tek Uvicorn süreciyle başlar; seed yok, sağlık kontrolü var. Frontend `NEXT_PUBLIC_API_URL=https://app.casebridge.com.tr/api` ile derlenir. **Hiçbir port host'a yayınlanmaz.** `cb-frontend` ve `cb-backend` Autosense ağına (`autosense-b2c_default`) katılır. |
| `deployment/Caddyfile.app-block` | Autosense'in Caddyfile'ına eklenecek blok. `app.casebridge.com.tr` için otomatik HTTPS sağlar; `/api/*` isteklerini önek kaldırılarak `cb-backend:8000`'e, geri kalanını `cb-frontend:3000`'e iletir. |
| `deployment/production.env.example` | `/etc/casebridge/production.env` dosyasının şablonu (bölüm 12). |

Kök geliştirme Compose dosyasıyla birleştirmeyin; her komutta yalnızca `-f deployment/compose.production.yml` kullanın.

`forwarded-allow-ips='*'` yalnızca bu mimari için güvenlidir: backend portu dışarıya açık değildir ve aynı Docker ağına güvenilmeyen servis eklenmez. İleride ağ yapısı değişirse güvenilen proxy adreslerini daraltın. Backend'i `--scale` ile çoğaltmayın, `--workers` eklemeyin.

İlk pilot doğrulandıktan sonra Postgres image'ını test edilen sürüm/digest'e sabitleyin ve image kimliklerini yayın kaydında saklayın.

Autosense ağı (`autosense-b2c_default`) Autosense stack'i tarafından oluşturulur. Autosense yeniden kurulur ve ağ yeniden yaratılırsa CaseBridge container'larını `up -d --force-recreate cb-backend cb-frontend` ile yeniden bağlayın.

Autosense'in Caddy'si, DNS doğru IP'yi gösterdiğinde `app.casebridge.com.tr` sertifikasını kendisi alır ve yeniler. Sertifikalar `autosense-b2c_caddy_data` volume'unda durur; bu volume silinmemelidir. Natro'dan bu alt alan adı için sertifika satın almanız gerekmez. [Caddy HTTPS açıklaması](https://caddyserver.com/docs/automatic-https)

## 12. Gizli ayarlar: `.env` yerine sunucuda korunan dosya

**Sunucuda:**

```bash
sudo install -d -m 700 /etc/casebridge
sudo install -m 600 /dev/null /etc/casebridge/production.env
sudo nano /etc/casebridge/production.env
```

Son komut dosyayı düzenlemek içindir. `install ... /dev/null` komutunu mevcut dosya üzerinde tekrar çalıştırmayın; ayarları sıfırlar. Tekrar düzenlemek için sadece `sudo nano ...` kullanın.

İçerik için repodaki şablonu kullanın: `deployment/production.env.example`. Şablonu açıp her `<...>` değerini doldurun. Doldurulacaklar:

| Grup | Ayarlar |
| --- | --- |
| Gizli değerler | `POSTGRES_PASSWORD`, `JWT_SECRET`. Sunucuda `openssl rand -hex 32` komutunu iki kez çalıştırın; iki ayrı değer kullanın. |
| Genel adres | `APP_BASE_URL`, `FRONTEND_BASE_URL`, `EXTRA_CORS_ORIGINS`: hepsi `https://app.casebridge.com.tr`. Bunlar yanlışsa davet bağlantıları `localhost`'a gider. |
| Platform ekibi | `PLATFORM_ADMIN_EMAILS`: hiçbir büroda kayıtlı olmayan adresler. |
| E-posta | `SMTP_*` (bölüm 12.1). |
| Yapay zekâ | `OPENAI_API_KEY`, `OPENAI_MODEL`, `CHAT_MODEL` (bölüm 15). |

Hex kullanmak bağlantı URL'sinde özel karakter sorunlarını önler. Değerleri sohbetlere, ekran görüntülerine, Git'e veya terminal çıktısı paylaşımına taşımayın. Nano'da kaydetmek için `Ctrl+O`, Enter; çıkmak için `Ctrl+X`.

`production.env` repo dışında tutulur; yalnızca backend container'a verilir. Anahtarları `NEXT_PUBLIC_*` değişkenlerine koymayın: bu değişkenler tarayıcıya giden koda işlenir. Compose'un çözülmüş yapılandırması da sır içerebilir; `docker compose config` çıktısını paylaşmayın. Doğrulama için `config --quiet` kullanın.

### 12.1. E-posta (SMTP)

Davetler, şifre sıfırlama ve hatırlatmalar SMTP ile gönderilir. Uygulama **587 portu ve STARTTLS** kullanır; 465 (doğrudan TLS) desteklenmez.

Bir sağlayıcı seçip şu bilgileri alın: SMTP sunucusu, kullanıcı adı, parola/uygulama parolası ve gönderen adresi. Natro e-posta hesabı, Google Workspace veya işlemsel e-posta servisi olabilir. Gönderen adres `casebridge.com.tr` alan adındaysa, sağlayıcının istediği **SPF/DKIM** TXT kayıtlarını DNS'e ekleyin; aksi hâlde davetler spam'e düşebilir. Mevcut MX ve TXT kayıtlarını silmeden, yalnızca ekleyin.

`production.env`'de: `EMAIL_BACKEND=smtp`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USE_TLS=true`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`.

Gönderim hatası kaydı engellemez: kullanıcı oluşur, ekranda "Davet e-postası gönderilemedi" uyarısı çıkar ve daveti sonra yeniden gönderebilirsiniz. Hatanın türü backend logunda görünür (adres ve bağlantı loglanmaz).

**Önemli:** Postgres volume'u ilk kez oluşturulurken kullanılan parola esas alınır. Sonradan env dosyasındaki parolayı değiştirmek veritabanındaki parolayı otomatik değiştirmez. Parola dönüşümünü DB ve backend tarafında birlikte planlayın. JWT secret değişirse mevcut token'lar geçersiz olur.

## 13. DNS: `app` kaydını eklemek

Bu kurulumda DNS, Hetzner Console'da **Autosense projesi → DNS → casebridge.com.tr** zone'unda yönetilir (bölüm 0); Natro'da işlem yapılmaz. Yeni kayıt ekleyin:

| Alan | Değer |
| --- | --- |
| Tür / Type | `A` |
| Host / Name | `app` |
| Değer / Target / IP | `49.13.139.19` |
| TTL | Panel izin veriyorsa 300 saniye; yoksa varsayılan |

Bazı paneller host için `app`, bazıları tam `app.casebridge.com.tr` ister; panelin zone ekleyip eklemediğine bakın. Yanlışlıkla `app.casebridge.com.tr.casebridge.com.tr` oluşturmayın.

- `app` için mevcut A veya CNAME varsa önce neye hizmet ettiğini tespit edin; çakışan kaydı değerlendirmeden yeni kayıt eklemeyin.
- IPv6 kurulmadıysa `app` için AAAA eklemeyin. Eski/yanlış AAAA bazı kullanıcılarda bağlantı veya sertifika hatasına yol açabilir.
- `@` ve `www` mevcut tanıtım sitesini göstermeye devam etmeli.
- MX ve TXT kayıtlarını değiştirmeyin.
- Cloudflare DNS yönetiyorsa ilk testte proxy'yi kapalı / DNS only tutmak hata çözmeyi kolaylaştırır. Daha sonra proxy ve TLS ayarlarını ayrı değerlendirin.

Kendi bilgisayarınızda veya sunucuda:

```bash
dig A app.casebridge.com.tr +short
dig AAAA app.casebridge.com.tr +short
dig @1.1.1.1 A app.casebridge.com.tr +short
dig @8.8.8.8 A app.casebridge.com.tr +short
```

A kaydı sunucunun IPv4 adresini göstermeli. TTL, önceki cache ve sağlayıcıya göre güncellenme süresi değişir; “kaydedildi” demek her yerde hemen güncellendi demek değildir. Sorunda önce yetkili NS cevabını kontrol edin.

## 14. İlk çalıştırma

**Sunucuda `/opt/casebridge` dizininde.** Önce ajanın güncel bağımlılıkları ve bilinen güvenlik uyarılarını değerlendirmesi gerekir. `npm audit fix --force` gibi sürümleri körlemesine değiştiren işlemler uygulamayın; gerekli düzeltmeleri test edin.

```bash
cd /opt/casebridge
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml config --quiet
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml build
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml up -d
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml ps
```

`db` healthy olmalı; backend migration tamamlanmalı. `depends_on`, backend'in istek kabul etmeye başladığını tek başına garanti etmez. Logları inceleyin:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml logs --tail=100 cb-backend cb-frontend
```

Backend container içinden sağlık kontrolü:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml exec -T cb-backend python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8000/health").read().decode())'
```

Beklenen: `status` alanı `ok`. Bu sadece API sürecinin yanıt verdiğini gösterir; veritabanı, dosya yükleme ve AI ayrıca test edilir.

### 14.1. İlk platform yöneticisi ve ilk büro

**Production üzerinde `python -m app.db.seed` çalıştırmayın**: bilinen demo şifreleriyle hesaplar oluşturur. Elle hesap oluşturan Python betiği de gerekmez; platform modeli bunu kendisi yapar.

1. `production.env` içindeki `PLATFORM_ADMIN_EMAILS` adreslerine backend ilk açılışta platform yöneticisi hesabı açar ve davet e-postası gönderir. Logda kontrol edin:
   ```bash
   sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml logs cb-backend | grep -i "platform\|e-posta"
   ```
   - "bir müşteri bürosunda kayıtlı olduğu için atlandı": adres zaten bir büroda kullanılıyor; başka adres yazıp `up -d --force-recreate cb-backend`.
   - "Platform yöneticisi davet e-postası gönderilemedi": SMTP ayarlarını düzeltip backend'i yeniden oluşturun. Yeni davet bir sonraki açılışta gider.
2. Bölüm 14.2'de HTTPS çalıştıktan sonra davet e-postasındaki bağlantıyı açın ve şifrenizi belirleyin. `https://app.casebridge.com.tr/platform` sayfasına gelirsiniz.
3. **Büro Yönetimi → Yeni büro** ile büroyu açın: büro adı, yöneticinin adı ve e-postası. Yöneticiye davet e-postası gider. Gitmezse büronun panelinden "Daveti yeniden gönder" kullanın.
4. Büro yöneticisi şifresini belirleyip `/admin`'e girer ve avukatları **Ayarlar > Kullanıcılar**'dan davet eder.

Davet bağlantısı varsayılan olarak 72 saat geçerlidir (`INVITE_TOKEN_HOURS`). Süresi dolan platform daveti bir sonraki backend açılışında yeniden gönderilir.

Canlı duruşma ekranında hazır kurgu senaryoları gerekiyorsa yalnızca senaryo seed'ini çalıştırın. Bu işlem demo hesabı veya dava oluşturmaz:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml exec -T cb-backend python -c 'from app.db.session import SessionLocal; from app.db.courtroom_seed import seed_courtroom_scenarios; db = SessionLocal(); count = seed_courtroom_scenarios(db); db.commit(); db.close(); print("Senaryo adedi:", count)'
```

### 14.2. HTTPS erişimini başlat (Autosense'in Caddy'sine blok eklemek)

Başlamadan önce iki koşul sağlanmalı:
- Bölüm 13'teki `app` A kaydı eklenmiş olmalı. `dig A app.casebridge.com.tr +short` komutu `49.13.139.19` döndürene kadar bekleyin.
- CaseBridge container'ları çalışıyor ve `cb-backend` healthy olmalı (bölüm 14).

1. Mevcut Caddyfile'ın yedeğini alın:
   ```bash
   sudo cp /opt/autosense-b2c/deploy/Caddyfile /opt/autosense-b2c/deploy/Caddyfile.bak-$(date +%Y%m%d%H%M)
   ```
2. CaseBridge bloğunu dosyanın sonuna ekleyin. Dosyada `app.casebridge.com.tr` zaten varsa komut tekrar eklemez:
   ```bash
   grep -q 'app.casebridge.com.tr' /opt/autosense-b2c/deploy/Caddyfile || { echo; grep -v '^#' /opt/casebridge/deployment/Caddyfile.app-block; } | sudo tee -a /opt/autosense-b2c/deploy/Caddyfile >/dev/null
   ```
3. Yeni ayarı çalışan Caddy içinde doğrulayın. Hata varsa **4. adıma geçmeyin**; yedeği geri koyun:
   ```bash
   sudo docker exec autosense-b2c-web-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
4. Ayarı kesintisiz yeniden yükleyin. Container yeniden başlatılmaz; Autosense ve ana site açık kalır:
   ```bash
   sudo docker exec -w /etc/caddy autosense-b2c-web-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   sudo docker logs --since 5m autosense-b2c-web-1 2>&1 | grep -i 'app.casebridge\|certificate\|error' | tail -20
   ```
5. Kontrol edin:
   ```bash
   curl --fail --show-error https://app.casebridge.com.tr/api/health
   curl -I https://app.casebridge.com.tr/login
   curl -sI https://casebridge.com.tr | head -1
   ```
   Son komut ana sitenin hâlâ açık olduğunu gösterir.

Geri almak gerekirse yedeği geri koyup aynı `caddy reload` komutunu çalıştırın.

Caddyfile Autosense'in deposunda izleniyorsa (`cd /opt/autosense-b2c && git status`), eklenen bloğu Autosense deposuna da commit edin. Aksi hâlde Autosense'in bir sonraki yayınında blok kaybolabilir.

Caddy'nin ilk sertifika işlemi tamamlanmadan erişim geçici olarak hata verebilir. HTTPS sertifika hatasını `curl -k` ile gizleyip başarılı saymayın.

## 15. Yapay zekâ: OpenAI

Bu kurulumda yapay zekâ için OpenAI kullanılır: dosya analizi, canlı duruşma, "Belgeden doldur" ve Hukuk Asistanı. `production.env`'de:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=GERCEK_GIZLI_ANAHTAR
OPENAI_MODEL=gpt-4o-mini
CHAT_PROVIDER=openai
CHAT_MODEL=gpt-4o-mini
```

- **Anahtar ve modeller:** Anahtarı OpenAI hesabının sahibi oluşturur. Modellerin o hesapta kullanılabildiğini doğrulayın; `gpt-4o-mini` yalnızca varsayılandır. İsteğe bağlı olarak Hukuk Asistanı'nın Basit/Kapsamlı seviyelerine ayrı model verilebilir: `CHAT_MODEL_BASIC`, `CHAT_MODEL_DEEP`.
- **Maliyet ve veri:** OpenAI hesabında aylık harcama sınırı koyun. Veri işleme koşullarını gözden geçirin; analizde dava metinleri OpenAI'ye gönderilir.
- **Sesli duruşma:** Canlı duruşmadaki sesli komut ve seslendirme de aynı anahtarı kullanır.
- **Gizlilik:** Anahtar yalnızca `/etc/casebridge/production.env` içinde kalır. `NEXT_PUBLIC_*` değişkenlerine asla konmaz.

İlk testi kurgu verilerle yapın. Ayarlar sayfasındaki sağlayıcı durumu yalnızca yapılandırmayı gösterir; bir analiz ve bir canlı duruşmayı uçtan uca deneyin. Hatalı veya eksik anahtarla uygulama sessizce mock'a geçmez: hata logda görünür.

Backend ortamı değiştiğinde `restart` yerine container'ı yeniden oluşturun:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml up -d --force-recreate cb-backend
```

Arayüzde Ayarlar bölümünden sağlayıcı durumunu kontrol edin; bu durumun başarılı olması modelin gerçek istekle yanıt verdiğini kanıtlamaz. Hem analiz hem canlı duruşma için uçtan uca test yapın.

## 16. casebridge.com.tr'ye “Başla” butonunu eklemek

Bu adım uygulamanın giriş ekranı ve hesapları test edildikten sonra yapılır. Natro'da domain hesabı olması ana sitenin kodunun da Natro'da olduğunu göstermez. Önce ana sitenin nasıl yönetildiğini öğrenin.

### WordPress ise

1. Yetkili WordPress yönetim paneline girin.
2. Ana sayfayı kullanılan düzenleyiciyle açın.
3. Üst menüye ve/veya ana karşılama bölümüne bir buton ekleyin.
4. Metin: **Başla**. Bağlantı: `https://app.casebridge.com.tr/login`.
5. Önizleme ile masaüstü/mobil görünümü kontrol edin, ardından yayınlayın.

### NatroSite veya başka site oluşturucu ise

İlgili site düzenleyicisini açıp buton/bağlantı bileşeninde aynı URL'yi kullanın. Domain DNS ekranı sayfa düzenleyicisi değildir; buton DNS panelinden eklenmez.

### Özel HTML / React / Next.js ise

Ana sitenin kendi reposunu bulun; bu uygulama reposunun tanıtım sitesini içerdiğini varsaymayın. Güncel tasarıma uygun bir bağlantı ekleyip o sitenin mevcut yayın yöntemini kullanın.

Basit HTML örneği:

```html
<a href="https://app.casebridge.com.tr/login">Başla</a>
```

Aynı sekmede açılması yeterlidir. Tasarım sınıfları ana siteye göre eklenir. Uygulamayı iframe içine gömmek yerine doğrudan bağlantı kullanın. DNS yönlendirmesi tek başına buton oluşturmaz.

## 17. Yayın kabul kontrol listesi

Butonu herkese göstermeden önce sonuçları not edin:

- [ ] `casebridge.com.tr` ve `www` mevcut siteyi açıyor; e-posta DNS kayıtları korunmuş.
- [ ] `app.casebridge.com.tr` doğru IP'ye gidiyor; yanlış AAAA veya CNAME yok.
- [ ] `http://app.casebridge.com.tr/login` HTTPS'e yönleniyor.
- [ ] HTTPS sertifikası tarayıcıda geçerli.
- [ ] Platform yöneticisi davet e-postası geldi, şifre belirlendi, `/platform` açılıyor.
- [ ] Yeni büro açıldı; büro yöneticisine davet e-postası gitti ve bağlantı `https://app.casebridge.com.tr/sifre-belirle...` adresine gidiyor (localhost değil).
- [ ] Büro yöneticisi bir avukat davet etti; avukat giriş yapabiliyor.
- [ ] `/login` sayfasında demo hesap ipucu görünmüyor.
- [ ] Bilinen demo hesapları yok veya devre dışı; production'da demo seed çalıştırılmamış.
- [ ] Dava oluşturma, listeleme ve güncelleme çalışıyor.
- [ ] Küçük bir kurgu belge yüklenebiliyor ve yeniden açılabiliyor.
- [ ] Yeniden başlatma sonrasında kayıtlar ve yüklenen dosyalar duruyor.
- [ ] Tarayıcının Network bölümünde API çağrıları `/api/...` üzerinden gidiyor; localhost çağrısı, CORS ve mixed-content hatası yok.
- [ ] OpenAI ile bir dosya analizi, bir canlı duruşma ve bir Hukuk Asistanı sorusu tamamlanıyor.
- [ ] İkinci bir test bürosu açıldı; iki büro birbirinin davalarını/kullanıcılarını göremiyor; büro yöneticisi `/platform`'a erişemiyor (403).
- [ ] Test bürosu askıya alındığında kullanıcıları giriş yapamıyor; aktifleştirince tekrar girebiliyor.
- [ ] Yetkisiz/role uygun olmayan erişimler sunucuda reddediliyor; sadece menü gizlemeye güvenilmiyor.
- [ ] Sunucunun 3000/8000/5432/11434 portları harici bilgisayardan erişilemiyor.
- [ ] Autosense ve `casebridge.com.tr` ana sitesi CaseBridge kurulumundan sonra da açılıyor.
- [ ] DB ve dosya yedeği alınmış; ayrı ortamda geri yüklenip okunmuş.
- [ ] Ana sitedeki buton masaüstü ve mobilde doğru adrese gidiyor.

Bu belge hazırlanırken bu liste yürütülmedi. Ajan tamamladığı her madde için gözlemlenen sonucu ve varsa kalan sorunu raporlamalı.

## 18. Günlük kullanım komutları

**Sunucuda, `/opt/casebridge` dizininde.** Her komutta aynı Compose dosyası ve env dosyası kullanılır. Yanlışlıkla kökte yalnızca `docker compose up` çalıştırmayın.

Durum:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml ps
```

Son loglar:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml logs --tail=100 cb-backend cb-frontend
```

Log takip etmek için `logs -f --tail=100 cb-backend`; çıkmak için `Ctrl+C`. Bu container'ı durdurmaz. Logları paylaşırken kimlik bilgisi, token ve kullanıcı verilerini temizleyin.

Kaynak kullanımı:

```bash
sudo docker stats --no-stream
df -h
free -h
```

**`docker compose down -v`, `docker volume prune` ve veri volume'larını silen komutlar kullanmayın.** `down -v` kalıcı veritabanı ve belge alanını silebilir. Normal yeniden başlatma/yayın için volume silmek gerekmez.

## 19. Yedekleme: DB ile belgeler birlikte

Hetzner disk yedeğine ek olarak uygulama seviyesinde yedek alın. Tek sunucunun kendi diskindeki kopya, sunucu kaybına karşı yeterli değildir; şifreli biçimde ayrı depoya aktarın. Otomatik günlük yedek, saklama süresi ve hata bildirimi operasyon sorumlusu/ajan tarafından ayrıca kurulmalıdır. Aşağıdaki işlem manuel, kısa kesintili ve tutarlı bir yedek alma örneğidir.

### 19.1. Manuel yedek

Önce çalışan işlerin bitmesini bekleyin ve bakım zamanını bildirin. Backend durunca devam eden AI işleri yarıda kalabilir; aktif oturum varken yedek için durdurmayın.

Sunucuda:

```bash
sudo install -d -m 700 /var/backups/casebridge
```

Aşağıdaki blok hata olursa uygulamayı tekrar başlatmayı dener. Yedek başarı mesajı alınmadan kopyayı geçerli kabul etmeyin:

```bash
sudo bash <<'BACKUP'
set -euo pipefail
umask 077
cd /opt/casebridge
backup_dir="/var/backups/casebridge/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
compose=(docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml)
trap '"${compose[@]}" up -d cb-backend cb-frontend' EXIT
"${compose[@]}" stop cb-frontend cb-backend
"${compose[@]}" exec -T cb-db pg_dump -U casebridge -d casebridge -Fc > "$backup_dir/database.dump"
docker run --rm -v cb-prod_storage:/data:ro -v "$backup_dir:/backup" alpine:3.22 tar -czf /backup/storage.tar.gz -C /data .
git rev-parse HEAD > "$backup_dir/commit.txt"
"${compose[@]}" images > "$backup_dir/images.txt"
cp /etc/casebridge/production.env "$backup_dir/production.env"
cp deployment/compose.production.yml "$backup_dir/compose.production.yml"
cp /opt/autosense-b2c/deploy/Caddyfile "$backup_dir/autosense-Caddyfile"
sha256sum "$backup_dir/database.dump" "$backup_dir/storage.tar.gz" > "$backup_dir/SHA256SUMS"
echo "Yedek tamamlandi: $backup_dir"
BACKUP
```

Bu volume adı, şablondaki `name: cb-prod` içindir. Proje adı değiştiyse gerçek volume adını kontrol edip komutu uyarlayın. Yedek `production.env` içerdiği için gizlidir. GitHub'a koymayın. Sunucu dışına şifreli kopyalama ve erişim politikası hazırlayın. `SHA256SUMS` dosyasını doğrulamak tek başına geri yükleme testi değildir.

### 19.2. Geri yükleme provası

Canlı DB'nin üzerine doğrudan geri yükleme yapmayın. Ajan ayrı bir geçici sunucuda veya izole Docker projesinde şu sırayı uygulasın:

1. `commit.txt` sürümüne uygun kodu ve image bilgilerini alın.
2. Yedeklerin bütünlüğünü doğrulayın, güvenli biçimde test ortamına aktarın.
3. Farklı Compose proje adı ve boş volume'larla PostgreSQL 16 başlatın. Canlı volume'ları ve 80/443 portlarını paylaşmayın. Farklı proje adı için `docker compose -p cb-restore ...` kullanılabilir; yapılandırmayı önce kontrol edin.
4. Boş DB'ye `pg_restore --exit-on-error --no-owner --no-privileges -U casebridge -d casebridge` ile dump'ı stdin'den verin. Yanlış hedefi silmeye yönelik `--clean` kullanmayın.
5. `storage.tar.gz` içeriğini yalnızca test ortamının boş storage volume'una çıkarın.
6. Backend'i aynı DB ve storage ile, dış kullanıcıya kapalı çalıştırın. Gerekli migration'ı önce sürüm uyumluluğunu değerlendirerek uygulayın.
7. Kullanıcı/dava sayıları ve örnek belge erişimini doğrulayın. Otomatik gerçek AI çağrısı yapılmasını önleyin.
8. Süreyi ve sonuçları kaydedin; sonra yalnızca prova kaynaklarını temizleyin.

Gerçek kurtarmada DNS/proxy geçişi, son yedekten beri kaybedilebilecek veri aralığı ve kullanıcı bildirimi ayrıca planlanır. Yedeğin varlığı ile geri yüklenebilir olması farklıdır.

## 20. GitHub'da yeni kod çıktığında güncelleme

Pilot için manuel yayın yeterli. Otomatik CI/CD'yi ilk kurulumdan sonra ekleyebilirsiniz.

1. Yeni sürümün testlerini ve migration'larını inceleyin. Yerel değişiklikleri/production yapılandırmalarını koruyun.
2. Önce bölüm 19'a göre DB + storage yedeği alın; mevcut SHA ve image kimliklerini kaydedin.
3. Kullanıcı işlemlerini durdurup bakım penceresi açın. Özellikle migration sırasında eski API'nin yazmaya devam etmesini önleyin.
4. Onaylanan branch'in güncel commit'ini alın.
5. Yeni image'ları build edin, servisleri başlatın ve kabul kontrollerini tekrarlayın.

Sunucuda, yedek ve sürüm incelemesi tamamlandıktan sonra:

```bash
cd /opt/casebridge
git status --short
git rev-parse HEAD
git fetch --prune origin
```

`git status` temiz değilse durup değişiklikleri değerlendirin. Hazır olduğunuzda:

```bash
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml stop cb-frontend cb-backend
git pull --ff-only
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml build cb-backend cb-frontend
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml up -d
sudo docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml logs --tail=100 cb-backend
curl --fail --show-error https://app.casebridge.com.tr/api/health
```

Bu yöntem kısa kesinti içerir; sıfır kesinti sözü vermez. Build başarısızsa sorunu çözün veya kaydedilmiş önceki sürümü uyumlu veritabanıyla yeniden başlatın; bakımı açık unutmayın.

`NEXT_PUBLIC_API_URL` değişirse frontend **yeniden build** edilmelidir. Container restart etmek tarayıcı paketindeki eski adresi değiştirmez.

### 20.1. Geri dönüş

Yalnızca kod değiştiyse ve DB şeması eski sürümle uyumluysa kaydedilen önceki commit/image'a dönülebilir. Migration varsa eski kodu geri almak tek başına güvenli olmayabilir. Ajan migration uyumluluğunu kontrol edip gerekirse önceki DB + storage yedeğini ayrı ortamda geri yüklemeli ve doğrulanan ortama geçiş yapmalıdır. Körlemesine `alembic downgrade`, volume silme veya canlı DB üzerine restore yapmayın. Yayından sonra oluşmuş verilerin eski yedeğe dönüşte kaybolabileceğini değerlendirin.

## 21. Hata çözme tablosu

| Belirti | Olası neden / kontrol |
| --- | --- |
| Natro hesabında domain görünmüyor | Yanlış müşteri hesabı; hesap sahibini teyit edin |
| Natro DNS değişti ama etkisi yok | NS başka sağlayıcıda; yetkili DNS'yi kontrol edin |
| Ana site veya e-posta bozuldu | Yanlış `@`, `www`, MX, TXT veya NS değişikliği; kayıt yedeğiyle karşılaştırın |
| SSH timeout | Yanlış IP, sunucu kapalı veya TCP 22 firewall kuralında yönetici IP'si eksik |
| SSH `Permission denied (publickey)` | Yanlış kullanıcı/key; `-i` yolu ve authorized_keys kontrolü |
| Host key değişti uyarısı | Sunucu yeniden kurulmuş olabilir; panelden fingerprint doğrulamadan kaydı silmeyin |
| GitHub `Repository not found` | Repo yolu veya deploy key yetkisi yanlış; private repo erişimi yok |
| Git branch bulunamıyor | Varsayılan branch'i tahmin etmeyin; `git branch -r` ve sahibinin onayı |
| Compose env eksik diyor | `--env-file /etc/casebridge/production.env` unutulmuş veya değer boş |
| Port already allocated | CaseBridge compose dosyası port yayınlamaz; root `docker-compose.yml` yanlışlıkla çalıştırılmış olabilir. `sudo ss -ltnp` ile inceleyin |
| `network autosense-b2c_default not found` | Autosense stack'i kapalı veya ağ adı değişmiş; `docker network ls` ile bakın. Autosense ayakta olmadan CaseBridge başlatılamaz |
| `app.casebridge.com.tr` 502 | `cb-frontend`/`cb-backend` çalışmıyor veya Autosense ağına bağlı değil; CaseBridge loglarına ve `docker network inspect autosense-b2c_default` çıktısına bakın |
| Autosense API'si CaseBridge'e gidiyor | Bir CaseBridge servisi `backend` adıyla Autosense ağına katılmış; servis adları `cb-` önekli olmalı |
| HTTPS sertifika alınamıyor | Yanlış A/AAAA, kapalı 80/443, CAA kısıtı, DNS cache veya ACME limitleri; Caddy logları |
| `/api/health` 502 | Backend hazır değil veya migration çöktü; backend logları ve DB health |
| `/api/health` 404 | `/api` öneki yanlış iletiliyor; `handle_path /api/*` kontrolü |
| Sayfa var ama veri gelmiyor | Frontend yanlış API adresiyle build edilmiş; Network sekmesi ve build arg |
| Tarayıcı localhost'a bağlanıyor | `NEXT_PUBLIC_API_URL` yanlış; frontend image'ını yeniden build edin |
| Login 401 | Yanlış hesap/parola veya hesap henüz davet bekliyor; demo hesaba güvenmeyin |
| Davet e-postası gelmiyor | SMTP ayarları, 587/STARTTLS, spam klasörü, SPF/DKIM; backend logunda "E-posta gönderilemedi" satırı |
| Davet bağlantısı localhost'a gidiyor | `FRONTEND_BASE_URL` / `APP_BASE_URL` eksik; düzeltip `up -d --force-recreate cb-backend`, daveti yeniden gönderin |
| Platform daveti hiç oluşmadı | `PLATFORM_ADMIN_EMAILS` boş veya adres bir büroda kayıtlı; backend logunda "PLATFORM_ADMIN_EMAILS" satırı |
| Login 429 | Giriş sınırına takılma; bekleyin, proxy IP iletimini ve deneme sayısını inceleyin |
| DB parola doğrulaması başarısız | Env parolası ile ilk volume kurulumundaki parola farklı |
| AI sonuçları örnek görünüyor | `LLM_PROVIDER` / `CHAT_PROVIDER` hâlâ `mock`; `openai` yapıp backend'i yeniden oluşturun |
| AI hata veriyor | OpenAI anahtarı, model erişimi, bakiye/harcama sınırı; backend logu |
| AI timeout / yanıt yok | Model erişimi, endpoint, bakiye, bellek veya CPU yetersiz; gerçek isteği ölçün |
| Container restart sonrası belgeler yok | Storage volume veya `STORAGE_DIR` yanlış; volume'ları silmeyin |
| Build sırasında süreç öldü / exit 137 | RAM/disk ve sistem loglarını kontrol edin; kaynak yetersizliğini ölçün |

## 22. Arkadaşının ajanına doğrudan iletilecek görev metni

Aşağıdaki metni bu README dosyası ve repo erişimiyle birlikte ajana verebilirsin:

```text
CaseBridge uygulamasını mevcut casebridge.com.tr tanıtım sitesine
“Başla” bağlantısıyla entegre edeceğiz. Uygulama
https://app.casebridge.com.tr/login adresinde çalışacak.

Önce deployment/README.md, ana README, varsa AGENTS.md talimatları ve
güncel kodu oku. Bu belgedeki şablonları güncel kodla karşılaştır.
Bu belge tamamlanmış bir deployment raporu değildir.

Önce mevcut durumu tespit et:
- Natro/domain hesabı, yetkili NS ve DNS sağlayıcısı,
- tanıtım sitesinin altyapısı, reposu veya düzenleyicisi,
- Hetzner sunucusu ve erişim durumu,
- GitHub'da yayınlanacak onaylı branch/commit,
- yerelde olup GitHub'a aktarılmamış değişiklikler,
- AI için mock/API/Ollama kararı.

Mevcut ana siteyi ve e-posta DNS kayıtlarını koru. Sadece app kaydını
hedefle; nameserver veya kök domain taşıması yapma.
Hesap girişi, 2FA ve ödeme gibi adımları hesap sahibi tamamlasın.
Gizli anahtar/parolaları sohbete, Git'e veya frontend koduna koyma.

deployment/compose.production.yml, deployment/Caddyfile.app-block ve
deployment/production.env.example repoda hazır. Sunucu Autosense ile ortak:
bölüm 0'ı oku; Autosense'in compose'una ve volume'larına dokunma, yalnızca
Caddyfile'a app bloğunu ekleyip caddy reload yap.
Kök geliştirme Compose dosyasını production için doğrudan kullanma.
Autosense Caddy'si üzerinden aynı origin /api yönlendirmesi ve HTTPS kur.
DB/backend/frontend portlarını host'a yayınlama.
Tek backend ve tek worker kullan; otomatik demo seed çalıştırma.
İlk hesaplar PLATFORM_ADMIN_EMAILS + SMTP davetiyle açılır; büroları
/platform panelinden aç. Elle kullanıcı ekleyen betik yazma.

Önce kurgu veriyle pilotu çalıştır; OpenAI ile gerçek analiz, canlı
duruşma ve asistan sorusunu doğrula. Production öncesi güvenlik
eksiklerini ve başarısız kontrolleri açıkça bildir.
DB + dosya yedeğini birlikte al ve ayrı ortamda geri yüklemeyi dene.
Uygulama doğrulandıktan sonra ana siteye Başla bağlantısını ekle.

Ücretli kaynak oluşturma ve mevcut veriyi etkileyen işlemlerde
hesap sahibinin yetkisi kapsamında ilerle. Canlı veri silme,
volume temizleme veya körlemesine DB downgrade yapma.

İşi sonunda şu bilgileri raporla:
- çalışan URL'ler, yayın commit SHA ve kullanılan image'lar,
- oluşturulan/değişen yapılandırmalar,
- yapılan DNS değişikliği ve eski kayıt,
- kabul testlerinin gerçek sonuçları,
- yedek konumu ve geri yükleme testi sonucu,
- güncelleme/geri dönüş yöntemi ve kalan işler.
Yapılmamış adımları tamamlandı diye işaretleme.
```

## 23. Resmi kaynaklar ve başvuru bağlantıları

- [Natro müşteri girişine erişim için resmi ana sayfa](https://www.natro.com/)
- [Natro DNS yönetim ekranı yardım metni](https://www.natro.com/hemendestek/bilgibankasi/natrositede-olusturdugum-web-sitemin-dns-yonetimini-nereden-gorebilirim-)
- [Hetzner Console](https://console.hetzner.com/)
- [Hetzner: sunucu oluşturma](https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/)
- [Hetzner: SSH ile sunucuya bağlanma](https://docs.hetzner.com/cloud/servers/getting-started/connecting-to-the-server/)
- [Hetzner: firewall oluşturma](https://docs.hetzner.com/cloud/firewalls/getting-started/creating-a-firewall/)
- [Docker: Ubuntu kurulumu ve firewall sınırlamaları](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy: reverse proxy başlangıcı](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [Caddy: otomatik HTTPS](https://caddyserver.com/docs/automatic-https)
- [GitHub: SSH host fingerprint bilgileri](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)

Hizmet panelindeki menüler, desteklenen işletim sistemleri ve fiyatlar değişebilir. İşlem sırasında resmi kaynak ve mevcut hesap ekranını esas alın.
