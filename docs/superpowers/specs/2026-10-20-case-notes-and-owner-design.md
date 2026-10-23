# Dava Notları, Gelişme Türleri, Geri Dönüş ve Sorumlu Avukat — Tasarım

- **Tarih:** 2026-10-20
- **Dal:** `feature/case-notes-and-owner` (`feature/case-lifecycle` `f6d2b7e` üzerinden)
- **Durum:** Onaylandı

## 1. Amaç

Kullanıcı akışı eksiklerinden iki madde:

- **(5) Notlar sekmesi hiç dolmuyor.** Olay formu tür seçtirmiyor, her kayıt "diğer" oluyor; not girilemiyor.
- **(6) Dava sayfasında geri dönüş yolu ve sorumlu avukat bilgisi yok.** "← Davalar" bağlantısı yok, üst çubuktaki "Davalar" tıklanmıyor; sorumlu avukat liste, önizleme ve dava sayfasında görünmüyor.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Not girişi | Notlar sekmesinde ayrı form. Not, `event_type=note` olan bir zaman çizelgesi kaydıdır. |
| Not düzenleme | Notlar düzenlenip silinebilir. Gelişmeler (not dışı kayıtlar) değişmez kalır. |
| Not yetkisi | Düzenleme/silme: notu yazan, davanın sorumlu avukatı veya yönetici. Ekleme: büroda herkes (mevcut kural). |
| Gelişme türü | Gelişmeler formuna tür seçimi; "Not" ve "Duruşma" seçilemez. |
| Sorumlu avukat | Başlık, liste (yeni sütun) ve önizlemede görünür. Yönetici "Bilgileri düzenle"den değiştirir; avukat yalnız görür. |
| Liste filtresi | "Sorumlu" filtresi: Tümü / Benim davalarım / avukat / Atanmamış. |
| Kapsam dışı | Devir akışı (madde 8), duruşma kaydı (hearing-dates işi), gelişmelerin düzenlenmesi. |

## 3. Notlar

### 3.1 Veri
- Yeni tablo veya migration yok. Not, `case_events` kaydıdır: `event_type=note`, metin `description`'da, `title` metnin ilk satırından türetilir (boşluklar sadeleştirilir, 120 karakterde "…" ile kesilir).
- Eski notlar (yalnız `title` dolu, `description` boş) arayüzde `title` ile gösterilir.
- `CaseEventOut`'a `created_by` (str | null) ve `created_by_name` (str | null) eklenir. Yazar silinmiş/bulunamıyorsa `null`.

### 3.2 API
- **Ekleme:** mevcut `POST /cases/{id}/events`. Not için `event_type: "note"`, `description` (zorunlu, kırpıldıktan sonra 1–4000 karakter), notlarda `title` gönderilse bile yok sayılır ve metinden türetilir. Not dışı türlerde `title` zorunlu kalır (1–255). Kurallar serviste uygulanır (pydantic doğrulayıcısı değil; arayüz yalnızca metin `detail` gösterebilir); ihlal 422 ve Türkçe metin: "Not metni boş olamaz." / "Not en fazla 4000 karakter olabilir." / "Gelişme başlığı boş olamaz." / "Gelişme başlığı en fazla 255 karakter olabilir." / "Açıklama en fazla 4000 karakter olabilir.". Kontrol sırası: 404 (dava), 409 (arşiv), 422.
- **Düzenleme:** `PATCH /cases/{id}/events/{event_id}` `{ description?: str, event_date?: date }`.
- **Silme:** `DELETE /cases/{id}/events/{event_id}` → 204.
- Düzenleme/silme kuralları (sırayla):
  1. Dava başka bürodaysa veya kayıt bu davaya ait değilse 404 "Kayıt bulunamadı.".
  2. Dava arşivliyse 409 "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın." (mevcut `require_case_writable`).
  3. Kayıt not değilse 409 "Yalnızca notlar düzenlenebilir veya silinebilir.".
  4. Kullanıcı notu yazan, sorumlu avukat veya yönetici değilse 403 "Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.".
- Düzenlemede `title` yeni metinden yeniden türetilir. Yanıt güncellenmiş `CaseEventOut`.

### 3.3 Arayüz
- **Notlar sekmesi:** üstte form (arşivli davada gizli): "Not" metin alanı (zorunlu, 4000 karakter sayacı), "Tarih" (varsayılan bugün, uygulamanın yerel saatine göre), "Not ekle" butonu (`aria-disabled` + guard).
- **Liste:** en yeni tarih üstte (aynı tarihte en yeni `created_at` üstte). Her notta tarih, yazan kişi ("— Ayşe Demir"; bilinmiyorsa gösterilmez), metin (satır sonları korunur).
- Yetkili kullanıcıya her notta "Düzenle" ve "Sil". Düzenle notu yerinde metin alanı + tarih + "Kaydet"/"Vazgeç" olarak açar. Sil onay penceresi açar ("Not silinsin mi? Bu işlem geri alınamaz." → "Sil"); `ModalFrame` kullanılır.
- Yetki arayüzde: `me.role === "admin" || me.id === note.created_by || me.id === case.assigned_lawyer_id`; backend her durumda doğrular.
- Hatalarda yalnızca `ApiError` mesajı, diğerlerinde Türkçe genel mesaj ("Not kaydedilemedi. Lütfen tekrar deneyin." / "Not silinemedi. Lütfen tekrar deneyin.").
- Not eklenince/düzenlenince/silinince hem Notlar listesi hem Gelişmeler zaman çizelgesi güncellenir (tek `timeline` durumu).

## 4. Gelişme türleri
- Gelişmeler formuna "Tür" seçimi (varsayılan "Diğer") ve isteğe bağlı "Açıklama" (≤ 4000) eklenir.
- Seçenekler ve etiketler (`labels.ts` → `CASE_EVENT_TYPE_LABELS`, tüm türleri kapsar):

| Değer | Etiket | Formda |
|---|---|---|
| `filing` | Dava açılışı / dilekçe | ✓ |
| `submission` | Beyan / cevap | ✓ |
| `expert_report` | Bilirkişi raporu | ✓ |
| `legal_update` | Mevzuat / içtihat gelişmesi | ✓ |
| `other` | Diğer | ✓ (varsayılan) |
| `hearing` | Duruşma | — |
| `note` | Not | — (Notlar sekmesinden) |

- Zaman çizelgesindeki her kayıtta tür rozeti; not kayıtları da çizelgede kalır. Backend, `POST` ile `hearing` gönderilmesini engellemez (seed, içe aktarma ve gelecekteki hearing-dates işi için); kısıt yalnız arayüzdedir.

## 5. Geri dönüş
- Dava sayfasının en üstünde "← Davalar" bağlantısı.
- `CaseListView` her sorgu değişiminde liste URL'sinin sorgu kısmını `sessionStorage`'a (`casebridge:lastCaseListQuery`) yazar; bağlantı bu sorguyla `/davalar?…`'a gider. Okuma/yazma `try/catch` içinde; kayıt yoksa veya okunamazsa düz `/davalar`.
- Üst çubuktaki (`WorkspaceHeader`) bölüm adı ("Davalar" vb.) ilgili liste sayfasına bağlantı olur; bulunulan sayfa zaten o listeyse bağlantı `aria-current="page"` taşır.

## 6. Sorumlu avukat

### 6.1 Veri ve API
- `Case` modeline `assigned_lawyer` ilişkisi; `CaseOut`'a `assigned_lawyer_name: str | None`.
- Dava listesi ve dava detayı sorguları ilişkiyi toplu yükler (`selectinload`), N+1 sorgu olmaz.
- `GET /cases?assigned_lawyer_id=none` yalnız sorumlusu olmayan davaları döndürür (özel değer `none`).
- `PATCH /admin/cases/{id}/lawyer`:
  - Arşivli davada 409 (mevcut arşiv mesajı).
  - Mesajlar Türkçe: 404 "Dava bulunamadı.", 422 "Bu büroda aktif bir avukat seçin.".

### 6.2 Arayüz
- **Başlık:** dava adının altındaki satırda "Sorumlu: <ad>" veya "Sorumlu: Atanmamış".
- **Liste:** "Durum"dan önce "Sorumlu" sütunu; atanmamışsa "—".
- **Hızlı önizleme:** "Sorumlu avukat" alanı.
- **Filtre:** listede "Sorumlu" seçimi: "Tümü", "Benim davalarım" (`avukat=<me.id>`), avukatlar (`GET /users`, ada göre sıralı), "Atanmamış" (`avukat=yok` → API'ye `none`). Mevcut `avukat` URL parametresi kullanılır; tanınmayan id ile gelen URL'de seçimde "Diğer avukat" gösterilir ve filtre uygulanır.
- **Bilgileri düzenle:** yalnız yöneticide "Sorumlu avukat" seçimi (`GET /admin/lawyers`). Mevcut sorumlu listede değilse (pasif vb.) seçenek olarak eklenir ve "(pasif)" ibaresi taşır. Kaydedince önce `PATCH /cases/{id}` (bugünkü gibi), sonra avukat değiştiyse `PATCH /admin/cases/{id}/lawyer`. İkincisi başarısız olursa pencere açık kalır, hata gösterilir ve ilk kayıt geri alınmaz (mesaj: "Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.").
- Sorumlu değişince başlıktaki ad ve yetkiye bağlı menüler (`canManageCase`) yeni değere göre güncellenir.

## 7. Test
- **Backend:** not ekleme doğrulaması (boş, 4000 sınırı, başlık türetme, yazar adı); PATCH/DELETE için 404 (başka büro, başka davanın kaydı), 409 (arşiv, not olmayan kayıt), 403 (başka avukat), 200/204 (yazan, sorumlu, yönetici); `assigned_lawyer_name` (liste/detay, atanmamış null); `assigned_lawyer_id=none`; atama ucunda arşiv 409 ve Türkçe mesajlar; liste sorgu sayısının dava sayısıyla artmaması.
- **Frontend:** Notlar formu, sıralama, yazar, düzenle/sil ve yetkiye göre görünürlük, arşivde gizlenme; Gelişmeler tür seçimi ve rozetler; "← Davalar" bağlantısı (kayıtlı sorgu ile ve storage hatasında); `WorkspaceHeader` bağlantısı; Sorumlu sütunu, önizleme, başlık; filtre seçenekleri ve URL; düzenleme penceresinde yöneticiye özel alan ve iki aşamalı kayıt hatası.
- **E2E:** avukat davada not ekler → düzenler → siler; "Benim davalarım" filtresiyle listeye gider, davayı açar, "← Davalar" ile filtreli listeye döner.
