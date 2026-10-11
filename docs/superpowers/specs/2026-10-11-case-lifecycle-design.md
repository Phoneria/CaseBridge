# Dava Düzenleme, Kapatma ve Arşivleme — Tasarım

- **Tarih:** 2026-10-11
- **Dal:** `feature/case-lifecycle` (`feature/user-management` `bc1deae` üzerinden)
- **Durum:** Onaylandı

## 1. Amaç

Dava açıldıktan sonra arayüzden düzenlenemiyor, kapatılamıyor, sonucu girilemiyor ve arşivlenemiyor (backend uçları var ama hiçbir ekran kullanmıyor). Bu yüzden dashboard'daki kazanma oranı, analitikteki kazanılan/kaybedilen davalar ve avukat bazlı başarı grafikleri gerçek bir büroda hep 0 kalıyor; yazım hataları bile düzeltilemiyor. Bu iş davanın temel bilgilerini düzenlemeyi, kapatmayı (sonuç + karar tarihi + not), yeniden açmayı ve arşivlemeyi ekler.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Yetki | Düzenleme, kapatma, yeniden açma, arşivleme, arşivden çıkarma: yalnızca davanın sorumlu avukatı (`assigned_lawyer_id`) ve yönetici. Olay/görev/belge ekleme büroda herkese açık kalır (arşivli dava hariç). |
| Kapatma | Sonuç (zorunlu), karar tarihi (zorunlu, varsayılan bugün, gelecekte olamaz), karar notu (isteğe bağlı), karar belgesi (isteğe bağlı). Zaman çizelgesine otomatik olay. Bekleyen görevler için uyarı (engellemez). |
| Sonuçlar | Mevcut üçü: Kazanıldı (`won`), Kaybedildi (`lost`), Sulh (`settled`). "Uzlaşma" adı her yerde "Sulh" olarak birleştirilir. |
| Arşiv | Yalnızca kapalı dava arşivlenir; arşivden çıkarılabilir. Arşivli dava salt okunur. Kapalı dava "Yeniden aç" ile açılabilir (arşivliyse önce arşivden çıkarılmalı). |
| Kapsam dışı | Duruşma tarihinin dava sayfasından girilmesi ve takvimle eşlenmesi (ayrı iş); sonuç türlerinin genişletilmesi. |

## 3. Kurallar

- **Açık durumlar:** `devam_eden`, `durusma_bekleyen`, `karar_bekleyen`. Düzenleme ile bunlar arasında serbestçe geçilir.
- **Kapalı durum:** `kapali` yalnızca `POST /cases/{id}/close` ile; açık duruma dönüş yalnızca `POST /cases/{id}/reopen` ile.
- **Sonuç:** açık davada her zaman `ongoing`; kapalı davada `won` | `lost` | `settled`.
- `PATCH /cases/{id}` artık `status=kapali`'yi ve `outcome` alanını kabul etmez → 422 ("Davayı kapatmak için 'Davayı kapat' işlemini kullanın." / "Sonuç yalnızca dava kapatılırken girilebilir."). Kapalı davada `status` alanı gönderilirse (açık bir değere) 422 ("Kapalı davayı açmak için 'Yeniden aç' işlemini kullanın."). Seed ve içe aktarma doğrudan model üzerinden yazdığı için etkilenmez.
- **Arşivli dava salt okunur:** `PATCH`, close, reopen, olay ekleme, görev ekleme/güncelleme, belge yükleme/silme → 409 "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın." Okuma işlemleri ve arşivden çıkarma serbest.
- **Yetki:** Sorumlu avukat değilse ve yönetici değilse `PATCH`, close, reopen, archive, unarchive → 403 "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir." Bu, case-intake işindeki Taraflar/Uyuşmazlık düzenlemesini de kapsar (aynı `PATCH`). Sorumlu avukatı olmayan dava yalnızca yönetici tarafından değiştirilebilir. Başka büronun davası her yerde 404.

## 4. Veri

- `cases` tablosuna (Alembic migration): `decision_date` (Date, nullable), `closing_note` (Text, nullable).
- Mevcut kapalı davalarda ikisi de `NULL` kalır (arayüzde "—").
- `CaseOut`/`CaseDetailOut` bu alanları döndürür.

## 5. API

- `POST /cases/{id}/close` `{ outcome: "won"|"lost"|"settled", decision_date: date, note?: str (≤4000, kırpılır) }`:
  - Dava açık değilse 409 "Dava zaten kapalı.".
  - `decision_date` bugünden sonra ise 422 "Karar tarihi ileri bir tarih olamaz." ("bugün" uygulamanın yerel saat dilimine göre, takvimdeki gibi).
  - `status=kapali`, `outcome`, `decision_date`, `closing_note` yazılır.
  - Zaman çizelgesine olay: tarih `decision_date`, başlık "Dava kapatıldı — <Sonuç etiketi>" (Kazanıldı/Kaybedildi/Sulh), açıklama not, tür `other`, `created_by` işlemi yapan.
  - Yanıt: güncellenmiş dava.
- `POST /cases/{id}/reopen`:
  - Dava kapalı değilse 409 "Dava zaten açık.".
  - `status=devam_eden`, `outcome=ongoing`, `decision_date=NULL`, `closing_note=NULL`.
  - Olay: tarih bugün, başlık "Dava yeniden açıldı", tür `other`.
- `POST /cases/{id}/archive`: kapalı değilse 409 "Yalnızca kapalı davalar arşivlenebilir."; zaten arşivliyse yanıt değişmeden döner (idempotent).
- `POST /cases/{id}/unarchive`: `is_archived=false` (idempotent).
- Karar belgesi: arayüz kapatma başarılı olduktan sonra mevcut `POST /cases/{id}/documents` ile yükler; yükleme başarısız olursa dava kapalı kalır ve uyarı gösterilir ("Dava kapatıldı ancak karar belgesi yüklenemedi.").

## 6. Arayüz

### 6.1 Dava sayfası
- Başlıkta durum rozeti (kapalıysa sonuç rozeti de: Kazanıldı yeşil, Kaybedildi kırmızı, Sulh gri-mavi) ve yalnızca yetkili kullanıcıya görünen "İşlemler" menüsü:
  - Açık dava: "Bilgileri düzenle", "Davayı kapat".
  - Kapalı, arşivsiz dava: "Bilgileri düzenle", "Yeniden aç", "Arşivle".
  - Arşivli dava: "Arşivden çıkar".
- Yetki kontrolü arayüzde `me.role === "admin" || me.id === case.assigned_lawyer_id` ile yapılır; backend her durumda doğrular. Taraflar/Uyuşmazlık kartlarındaki "Düzenle" butonları da aynı kurala göre gösterilir.
- **Bilgileri düzenle** (modal): Dava adı*, Dava türü*, Mahkeme, Esas no, Dava tarihi, Dava değeri, Durum (yalnızca açık durumlar; kapalı davada durum alanı gösterilmez). case-intake'teki ortak form bileşenleri ve uzunluk sınırları kullanılır. Dava no değiştirilemez (salt okunur gösterilir).
- **Davayı kapat** (modal): Sonuç* (radyo: Kazanıldı / Kaybedildi / Sulh), Karar tarihi* (varsayılan bugün, `max` bugün), Karar notu, "Karar belgesi ekle" (pdf/docx/txt, ≤10 MB). Davanın bekleyen görevi varsa uyarı: "Bu davada <n> bekleyen görev var." (engellemez). Buton "Davayı kapat".
- **Yeniden aç**: onay penceresi "Dava yeniden açılsın mı? Sonuç ve karar bilgisi temizlenecek; kapanış kaydı zaman çizelgesinde kalır." → "Yeniden aç".
- **Arşivle**: onay penceresi "Dava arşivlensin mi? Arşivli dava salt okunur olur." → "Arşivle".
- **Karar kartı** (kapalı davada, Genel Bakış'ta): Sonuç, Karar tarihi, Karar notu.
- **Arşiv bandı** (arşivli davada, sayfanın üstünde): "Bu dava arşivlendi; salt okunur." + yetkiliyse "Arşivden çıkar". Olay/görev/belge ekleme formları ve düzenleme butonları gizlenir.
- Modallar: `role="dialog"`, `aria-modal`, odak yönetimi (users işindeki `ModalFrame` kullanılır), kaydederken Escape/Vazgeç kilitli; butonlar `aria-disabled` + guard; yalnızca `ApiError` mesajları, diğer hatalarda Türkçe genel mesaj.

### 6.2 Dava listesi
- Filtrelere "Arşivi göster" onay kutusu (mevcut `arsiv=dahil` URL parametresine bağlanır).
- Arşivli satırlarda "Arşivli" rozeti.

### 6.3 Adlandırma
- Sonuç etiketleri her yerde: "Kazanıldı", "Kaybedildi", "Sulh", "Devam ediyor". "Uzlaşma" geçen tüm etiketler (`labels.ts`, `filters.ts`, analitik/rapor metinleri) "Sulh" olur; URL parametresi `sulh` aynı kalır.

## 7. Etki
Dashboard (kazanılan/kaybedilen/kazanma oranı), Analitik (kaybedilen davalar, avukat bazlı) ve Raporlar mevcut `status`/`outcome` alanlarından hesaplanır; kodları değişmez. Testlerle, kapatma sonrası sayımların arttığı doğrulanır.

## 8. Test
- **Backend:** PATCH'in `kapali`/`outcome`/kapalı davada `status` reddi; close (sonuçlar, gelecek tarih 422, zaten kapalı 409, olay, not kırpma), reopen (alanların temizlenmesi, olay, açık davada 409), archive (açık davada 409, idempotent), unarchive; arşivli davada tüm yazma işlemlerinin 409'u (PATCH, close, reopen, olay, görev ekleme/güncelleme, belge yükleme/silme); yetki (sorumlu avukat ✓, yönetici ✓, başka avukat 403, sorumlusuz davada avukat 403, başka büro 404); migration; analitik sayımlarının kapatmadan sonra değişmesi.
- **Frontend:** İşlemler menüsünün görünürlüğü (rol/sorumlu/durum/arşiv), üç modal ve onaylar, karar kartı, arşiv bandı ve gizlenen formlar, liste filtresi ve rozet, "Sulh" etiketleri.
- **E2E:** Avukat kendi davasını düzenler → karar belgesiyle kapatır → dashboard'da kazanılan sayısı artar → arşivler → salt okunur görünür → arşivden çıkarır → yeniden açar.
