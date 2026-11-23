# Müvekkiller tablosu ve müvekkil ekranı — Tasarım

Tarih: 2026-11-16
Durum: Onaylandı (kullanıcı incelemesi bekleniyor)

## Amaç

Bugün müvekkil yalnızca davadaki tarafların `is_client` işaretiyle ve davadaki `client_name` metniyle tutulur. Aynı müvekkilin davaları birbirine bağlı değildir, iletişim bilgisi tutulamaz ve "bu müvekkilin davaları" sorusu cevaplanamaz.

Bu iş üç şey ekler:

- büroya ait ayrı bir `clients` tablosu,
- müvekkil olarak işaretlenen her davanın tarafının bu tabloya bağlanması,
- müvekkil listesi ve müvekkil detayı ekranları.

## Kararlar

- **Bağlantı taraf üzerinden kurulur:** `case_parties.client_id`. Bir davada birden çok müvekkil olabilir. Ayrı bir ara tablo (`client_cases`) veya yalnızca adla eşleştirme seçenekleri reddedildi. Ara tablo aynı bilgiyi ikinci kez tutar; adla eşleştirme ise ad değişince kopar.
- **Müvekkil alanları:** ad/unvan, tür (kişi/şirket), telefon, e-posta, adres, not. TC kimlik no ve vergi no tutulmaz.
- **Dava formunda seçim:** müvekkil aranır ve seçilir; bulunamazsa aynı yerden yeni müvekkil eklenir.
- **Mevcut veri:** geçişte, büro içinde aynı normalleştirilmiş ada sahip müvekkil tarafları tek müvekkil kaydında birleştirilir.
- **Müvekkil ekranı:** liste ve arama, detay ve davalar, özet sayılar.
- **Emsal kararlar** (`is_precedent = true` olan davalar) müvekkile bağlanmaz. Bu davaların tarafları "Davacı (anonim)" gibi adlar taşır; geçiş, içe aktarma ve sayımlar bu davaları dışarıda bırakır.
- **Kapsam dışı:** müvekkil birleştirme, genel aramada müvekkiller, müvekkile özel belge veya not sekmesi.

## 1. Veri modeli

Tek bir Alembic migration'ı eklenir. Hem şemayı hem veriyi taşır.

### `clients` tablosu

| Alan | Tür | Not |
|---|---|---|
| `id` | `String(36)` PK | uuid4 |
| `law_firm_id` | FK `law_firms.id`, NOT NULL, indeksli | |
| `name` | `String(255)`, NOT NULL | ad veya unvan |
| `name_key` | `String(255)`, NOT NULL | normalleştirilmiş ad (aşağıda) |
| `client_type` | `String(20)`, NOT NULL, varsayılan `person` | `person` veya `company` (`ClientType` enum'u, API'de doğrulanır) |
| `phone` | `String(50)`, NULL | serbest metin |
| `email` | `String(255)`, NULL | |
| `address` | `Text`, NULL | |
| `notes` | `Text`, NULL | |
| `created_by` | FK `users.id`, NULL | |
| `created_at`, `updated_at` | `DateTime` | mevcut modellerdeki UTC deseni |

`(law_firm_id, name_key)` üzerinde **benzersiz olmayan** bir indeks bulunur. Aynı ada sahip iki farklı kişi aynı büronun müvekkili olabilir.

### `case_parties.client_id`

- `String(36)`, FK `clients.id`, NULL olabilir, indeksli.
- Değişmez kural (emsal olmayan davalarda): `is_client = true` olan tarafın `client_id` değeri doludur; `is_client = false` olan tarafınki boştur. Kuralı servis katmanı uygular. `is_client` sütunu uyumluluk için yerinde kalır.
- Bağlı tarafın `name` değeri her zaman müvekkilin `name` değerinin kopyasıdır. Müvekkilin adı değişince bağlı tarafların adı ve bu tarafların davalarındaki `client_name` aynı işlemde yeniden yazılır. `client_name` alanı mevcut `derive_client_name` yardımcısıyla üretilir. Böylece `client_name` ve `opposing_party` alanlarını okuyan dava listesi, arama, raporlar, emsaller, duruşma, AI bağlamı ve devir raporu değişmeden çalışır.

### Ad normalleştirme (`client_name_key`)

1. Baştaki ve sondaki boşluklar kırpılır, aradaki çoklu boşluklar teke indirilir.
2. Türkçe küçük harf: önce `I` → `ı` ve `İ` → `i`, sonra `str.lower()`.

Örnek: `"ACME  Ltd."` ve `" acme ltd."` aynı anahtarı verir: `"acme ltd."`. `"IŞIK"` ve `"ışık"` de aynı anahtarı verir.

Fonksiyon `app/services/client_names.py` içinde tanımlanır. Migration uygulama koduna bağımlı olmaması için bu fonksiyonun kendi içindeki bir kopyasını kullanır.

### "Bul, yoksa aç" (`find_or_create_client`)

Bu fonksiyon `app/services/client_service.py` içindedir. Büro kimliği ve ad alır, büroda aynı `name_key` ile kayıtlı müvekkili döndürür. Birden çok kayıt eşleşirse `created_at`, ardından `id` sırasına göre ilkini döndürür. Eşleşen kayıt yoksa `person` türünde, yalnızca adı dolu yeni bir müvekkil açar. Fonksiyonu şunlar kullanır:

- `client_id` gönderilmeden müvekkil olarak işaretlenmiş taraflar (eski API yolu, AI'nın doldurduğu taraflar),
- yalnızca `client_name` ile açılan davalar (`legacy_parties`),
- `seed.py`, `demo_template.py`, `import_cases.py`.

### Geçiş

1. `clients` tablosu ve `case_parties.client_id` sütunu oluşturulur.
2. Her büroda, emsal olmayan davalarda `is_client = true` olan taraflar `name_key` değerine göre gruplanır.
3. Her grup için bir müvekkil açılır:
   - `name`: grupta en sık geçen özgün yazım; eşitlikte en eski tarafın yazımı.
   - `client_type`: `person`. İletişim alanları boş kalır.
   - `created_at`: gruptaki en eski tarafın `created_at` değeri.
4. Gruptaki tarafların `client_id` değerleri doldurulur. Değişmez kuralın geçişten sonra da geçerli olması için bağlı tarafların `name` değeri müvekkilin adıyla değiştirilir. Bunun sonucunda yazımı değişen taraflar olursa, bu tarafların davalarında `client_name` yeniden türetilir: müvekkil tarafların adları `sort_order` sırasıyla `", "` ile birleştirilir ve 255 karaktere kesilir.
5. **Geri alma (downgrade):** önce `client_id` sütunu, sonra `clients` tablosu silinir. Taraf adları yerinde durduğu için veri kaybı olmaz.

Yayın öncesinde pilot veritabanının yedeği alınır. Migration, backend açılışındaki `alembic upgrade head` ile uygulanır.

## 2. API

Yeni rota dosyası `app/api/routes/clients.py`, ön eki `/clients`. Tüm sorgular `get_current_law_firm_id` ile büroya sınırlıdır. Başka büronun müvekkili, başka büronun davasında olduğu gibi 404 döner.

### Uç noktalar

- **`GET /clients?q=&limit=&offset=`**
  - `q`: `name_key` içinde normalleştirilmiş arama, ayrıca `phone` ve `email` içinde büyük/küçük harf duyarsız arama.
  - Sıralama `name_key`'e göre yapılır. `limit` varsayılanı 50, en fazla 200.
  - Her satır `ClientListItem` döner: müvekkil alanları, `case_count` (bağlı taraf üzerinden farklı dava sayısı, arşivliler dahil) ve `open_case_count` (`case_is_active()`).
  - Dava formundaki arama kutusu bu uç noktayı `limit=10` ile çağırır.
- **`POST /clients`** → 201 `ClientOut`.
  - `name` zorunludur; kırpılmış hali 1–255 karakter olmalıdır.
  - `client_type` varsayılanı `person`.
  - `email` boşsa `None` olur; doluysa basit biçim kontrolünden geçer.
  - `phone` en fazla 50 karakter olabilir.
- **`GET /clients/{id}`** → `ClientDetailOut`, içinde `ClientOut`, `stats` ve `cases` bulunur.
  - `stats`:
    - `total`: toplam dava sayısı.
    - `open`: `case_is_active()` koşulunu sağlayan davalar.
    - `closed`: durumu `KAPALI` olan davalar.
    - `archived`: arşivlenmiş davalar.
    - `won`, `lost`, `settled`: sonuca göre dava sayıları.
    - `total_case_value`: `case_value` toplamı; `None` değerler 0 sayılır.
  - `cases`: her öğede `id`, `case_number`, `case_name`, `case_type`, `status`, `outcome`, `assigned_lawyer_name`, `next_hearing_date`, `is_archived` bulunur. Sıralama: önce açık davalar, sonra `next_hearing_date` (boş değerler en sonda), sonra `opening_date` (yeniden eskiye).
- **`PATCH /clients/{id}`** → `ClientOut`. Kısmi güncellemedir. `name` değişirse `name_key` yeniden hesaplanır, bağlı tarafların adı ve ilgili davaların `client_name` değeri aynı işlemde yeniden yazılır. Arşivli davalarda da yeniden yazılır, çünkü bu alan türetilmiş bir kopyadır.
- **`DELETE /clients/{id}`** → 204.
  - Yalnızca büro yöneticisi silebilir; diğer kullanıcılar 403 alır.
  - Bağlı taraf varsa 409 döner: "Bu müvekkilin davaları var; silinemez."

Müvekkil eklemeyi ve düzenlemeyi büronun her kullanıcısı yapabilir. Büroda herkes tüm davaları görebildiği için bu, bugünkü görünürlük kuralıyla uyumludur.

### Dava API'sindeki değişiklikler

- `CasePartyIn` şemasına `client_id: Optional[str]` eklenir.
- `CaseService` taraf listesini yazarken her taraf için şu kuralları uygular:
  - `client_id` gönderilmişse müvekkil aynı büroda aranır. Bulunamazsa 422 döner: "Seçilen müvekkil bulunamadı." Bulunursa taraf `is_client = true` olarak yazılır ve `name` değerinin yerine müvekkilin adı konur.
  - `is_client = true` ama `client_id` yoksa `find_or_create_client` kullanılır.
  - `is_client = false` ise `client_id` dikkate alınmaz ve `None` olarak yazılır.
- `CasePartyOut` şemasına `client_id` eklenir.
- `GET /cases` uç noktasına `client_id` filtresi eklenir. Filtre, en az bir tarafı bu müvekkile bağlı olan davaları getirir.

### Kayıt (log)

`client.created`, `client.updated` ve `client.deleted` olayları yalnızca `client_id`, `law_firm_id` ve `user_id` değerleriyle loglanır. Ad ve iletişim bilgileri kişisel veri olduğu için loglara yazılmaz.

## 3. Ekranlar

### Kenar çubuğu

"Davalar"ın altına **Müvekkiller** öğesi eklenir (`/muvekkiller`).

### `/muvekkiller` — `ClientListView`

- Üstte arama kutusu (ad, telefon, e-posta; 300 ms gecikmeli) ve **Yeni müvekkil** düğmesi bulunur.
- Tablo sütunları: Ad, Tür (Kişi/Şirket), Telefon, E-posta, Dava, Açık. Satıra tıklayınca detay sayfası açılır.
- Sayfalama, boş durum, yükleme ve hata durumları mevcut `EmptyState`, `LoadingState` ve `ErrorState` bileşenleriyle gösterilir.
- **Yeni müvekkil** düğmesi `ClientFormModal`'ı açar (`ModalFrame`). Alanlar: ad, tür, telefon, e-posta, adres, not. Kayıttan sonra yeni müvekkilin detay sayfasına gidilir.

### `/muvekkiller/[id]` — `ClientDetailView`

- **Başlık:** ad, tür rozeti, "Müvekkillere dön" bağlantısı, **Düzenle** düğmesi (aynı modal) ve yalnızca yöneticiye görünen **Sil** düğmesi. Müvekkilin davası varsa Sil pasiftir ve nedeni gösterilir. Silme onayı `CaseConfirmModal` deseniyle alınır.
- **İletişim kartı:** telefon (`tel:` bağlantısı), e-posta (`mailto:` bağlantısı), adres, not.
- **Özet sayılar:** `StatCard` kartlarında toplam dava, açık dava, kazanılan / kaybedilen / sulh ve toplam dava değeri (₺) gösterilir.
- **Davalar tablosu:** Dava no, Ad, Tür, Durum, Sorumlu avukat, Sonraki duruşma sütunları bulunur. Arşivli davalar soluk gösterilir. Satıra tıklayınca `/davalar/[id]` açılır.
- **Bu müvekkil için yeni dava** düğmesi `/davalar/yeni?muvekkil=<id>` adresini açar.

### Dava formunda müvekkil seçimi — `PartiesFields`

Bu bileşen hem `NewCaseView` hem `CasePartiesCard` tarafından kullanılır.

- `PartyRow` tipine `client_id: string | null` eklenir. Seçili müvekkilin adı satırın `name` alanında tutulur.
- **Müvekkil işaretli satırda** Ad alanı yerine `ClientPicker` gösterilir:
  - Yazıldıkça `GET /clients?q=&limit=10` çağrılır. Öneri satırında ad, tür ve telefon görünür.
  - Listenin sonunda her zaman **"+ '…' adıyla yeni müvekkil ekle"** seçeneği bulunur. Bu seçenek `POST /clients` ile yalnızca adı dolu, `person` türünde bir müvekkil açar ve onu seçer. Hata olursa satırda mesaj gösterilir ve yazılan metin korunur.
  - Seçili müvekkil, adı ve "değiştir" düğmesiyle birlikte bir etiket olarak görünür. Ad, müvekkil sayfasına bağlantıdır.
  - Klavye kullanılabilir: ok tuşları, Enter, Esc. Alan `role="combobox"` ve `aria-expanded` niteliklerini taşır.
- **Müvekkil işaretli olmayan satırda** Ad alanı bugünkü gibi serbest metindir. İşaret kaldırılınca `client_id` temizlenir ve son görünen ad metin olarak kalır.
- **AI'nın doldurduğu taraflar:** AI'nın müvekkil olarak işaretlediği tarafın adı aramaya önceden yazılır ve öneri listesi açılır. Kullanıcı bir müvekkil seçmeden veya yeni müvekkil eklemeden form gönderilemez.
- **Doğrulama (`validateParties`):** müvekkil işaretli ama `client_id` boş olan satırda şu hata gösterilir: "Müvekkili listeden seçin veya yeni ekleyin."
- **`buildPartiesPayload`:** müvekkil işaretli satırlar `client_id` ile gönderilir.
- **`?muvekkil=<id>`:** `NewCaseView` müvekkili getirir ve ilk tarafı bu müvekkil seçili, müvekkil işaretli olarak açar.

### Dava sayfası

`CasePartiesCard` salt okunur görünümünde müvekkil adları `/muvekkiller/[client_id]` sayfasına bağlantıdır.

## 4. Hata durumları

| Durum | Yanıt / arayüz |
|---|---|
| Müvekkil başka büroda veya yok (`GET`/`PATCH`/`DELETE`) | 404; arayüz `ErrorState` gösterir |
| Davada başka büronun veya var olmayan `client_id` | 422 "Seçilen müvekkil bulunamadı." |
| Boş ad veya hatalı e-posta | 422; alanın altında Türkçe mesaj |
| Davası olan müvekkili silme | 409 "Bu müvekkilin davaları var; silinemez." |
| Yönetici olmayanın silmesi | 403 (düğme zaten görünmez) |
| Hızlı ekleme başarısız | Satırda mesaj; yazılan ad korunur |

## 5. Diğer kod değişiklikleri

- `seed.py`, `demo_template.py`, `import_cases.py`: taraflar `find_or_create_client` üzerinden bağlanır. Birkaç demo müvekkile telefon ve e-posta eklenir.
- `import_cases.py`: emsal davaların tarafları müvekkile bağlanmaz.
- `demo_cleanup.py`: büro silinmeden önce, artık hiçbir tarafa bağlı olmayan müvekkiller silinir. `purge.py` yalnızca davaları siler; davası kalmayan müvekkil geçerli bir kayıttır ve yerinde kalır.
- Sayımlar (`case_count`, `open_case_count`, `stats`, `cases`) ve `GET /cases?client_id=` emsal davaları saymaz.
- Frontend `types` ve `lib/api` dosyalarına `Client`, `ClientDetail` tipleri ve `listClients`, `getClient`, `createClient`, `updateClient`, `deleteClient` fonksiyonları eklenir.

## 6. Testler

- **Backend birim:**
  - `client_name_key`: Türkçe I/İ, boşluklar, büyük/küçük harf.
  - `find_or_create_client`: bulma, açma, aynı anahtarla birden çok kayıt olduğunda en eskiyi seçme.
  - Geçiş gruplaması ve ad seçimi.
- **Backend API:**
  - CRUD ve arama.
  - Büro izolasyonu: 404 ve 422.
  - Ad değişikliğinin taraf adlarına ve `client_name` alanına yansıması.
  - Silme kuralları: 403 ve 409.
  - `stats` hesapları ve `cases` sıralaması.
  - `client_id` ile ve `client_id` olmadan dava oluşturma ve güncelleme; eski `client_name` yolu.
  - `GET /cases?client_id=` filtresi.
- **Migration:** eski biçimde taraflar içeren bir veritabanında `upgrade`, ardından birleşmeleri ve `downgrade` sonucunu doğrulama.
- **Frontend (vitest):**
  - `ClientListView` ve `ClientDetailView`.
  - `ClientPicker`: arama, seçim, hızlı ekleme, hata durumu.
  - `PartiesFields` ve `validateParties`: müvekkil seçilmeden kaydetmeyi engelleme.
  - AI'nın doldurduğu taraflarda önerilerin açık gelmesi.
  - `?muvekkil=` ile formun önceden doldurulması.
- **E2E:** yeni `19-clients.spec.ts` testi şu akışı izler:
  1. Müvekkil eklenir.
  2. Bu müvekkil için dava açılır.
  3. Müvekkil sayfasında dava ve sayılar görülür.
  4. Müvekkilin adı değiştirilir.
  5. Dava sayfasında yeni ad görülür.

  `01-case-lifecycle` ve `11-case-lifecycle` testleri yeni seçim kutusuna göre güncellenir.
