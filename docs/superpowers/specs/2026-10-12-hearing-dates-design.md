# Duruşma Tarihleri (Dava ↔ Takvim) — Tasarım

- **Tarih:** 2026-10-12
- **Dal:** `feature/hearing-dates` (`feature/case-notes-and-owner` `08abbab` üzerinden; ilk olarak `feature/case-lifecycle` `bbe1c08` üzerinde yazıldı)
- **Durum:** Onaylandı

## 1. Amaç

Bugün duruşma bilgisi iki yerde ve tek yönlü eşleniyor: takvimdeki davaya bağlı "duruşma" etkinlikleri davanın `next_hearing_date` alanını güncelliyor; ama davanın kendi tarih alanı (oluşturma, içe aktarma, API) takvimde yalnızca türetilmiş, salt okunur bir satır olarak görünüyor (saat, salon, not yok, düzenlenemez). Dava sayfasından duruşma eklenemiyor; geçen bir duruşmadan sonra `next_hearing_date` bir sonrakine kaymıyor. Bu iş, duruşmaları tek kaynakta (takvim etkinliği) toplar, dava sayfasına bir "Duruşmalar" kartı ve duruşma sonrası kayıt (ara karar notu + sonraki duruşma) ekler.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Tek kaynak | Davaya bağlı `hearing` türündeki takvim etkinliği. `cases.next_hearing_date` türetilmiş önbellektir; elle yazılmaz. |
| Kapsam | Planlama (ekle/düzenle/sil) + duruşma sonrası kayıt (sonuç notu, zaman çizelgesi olayı, "Sonraki duruşmayı ekle"). |
| Yetki | Bürodaki herkes (takvim/görevlerle aynı). Kapalı davaya yeni duruşma eklenemez; arşivli dava salt okunur (mevcut kural). |
| Kapsam dışı | Hukuki süre takibi, ara karardan otomatik görev üretimi, UYAP entegrasyonu. |

## 3. Veri

### 3.1 `calendar_events` tablosuna (migration)
- `result_note` (Text, nullable): duruşma sonrası sonuç / ara karar notu.
- `result_case_event_id` (FK `case_events.id`, nullable, `ON DELETE SET NULL`): sonuç notunun zaman çizelgesindeki olayı.

### 3.2 `next_hearing_date` hesabı
- Tanım: davanın `starts_at` tarihi (yerel, `APP_TIMEZONE`) bugün veya sonrası olan en erken `hearing` etkinliğinin tarihi; yoksa `NULL`.
- Tek fonksiyon (`recompute_next_hearing(db, case, today)`) şu durumlarda çağrılır: duruşma etkinliği oluşturma/güncelleme (tür, tarih veya `case_id` değişimi — eski ve yeni dava)/silme; yeni dava oluşturma; içe aktarma; seed; migration.
- Gece yeniden hesaplama: mevcut hatırlatma işçisi günde bir kez (yerel gün değişince ilk turda) tüm açık davaların `next_hearing_date`'ini yeniden hesaplar; böylece geçen duruşmadan sonra tarih bir sonrakine kayar.
- Mevcut `_sync_next_hearing` / `_release_hearing_day` mantığı bu fonksiyonla değiştirilir.

### 3.3 Migration
- Her dava için: `next_hearing_date` doluysa ve o tarihte davaya bağlı bir `hearing` etkinliği yoksa, tüm gün `hearing` etkinliği oluşturulur:
  - `title` "Duruşma", `all_day=true`, `starts_at` o günün 00:00'ı, `case_id`, `law_firm_id`, `assignee_id` = davanın sorumlu avukatı (yoksa `NULL`), `created_by` = sorumlu avukat, yoksa büronun en eski aktif yöneticisi, o da yoksa büronun en eski kullanıcısı; hiç kullanıcı yoksa dava atlanır (migration çıktısında sayılır), `reminder_days` = mevcut duruşma varsayılanı (`HEARING_REMINDER_DAYS`).
- Ardından her davanın `next_hearing_date`'i 3.2'deki kurala göre yeniden hesaplanır (migration anındaki yerel tarihle). Geçmiş tarihli eski değerler geçmiş duruşma etkinliği olarak kalır, `next_hearing_date` `NULL` olur.
- Downgrade: yalnızca iki yeni sütunu kaldırır (oluşturulan etkinlikler kalır; zararsız).

## 4. Kurallar

- `PATCH /cases/{id}` `next_hearing_date` alanını reddeder → 422 "Duruşma tarihi Duruşmalar bölümünden eklenir."
- `POST /cases` `next_hearing_date` verilirse: dava oluşturulduktan sonra aynı işlemde tüm gün `hearing` etkinliği oluşturulur (3.3'teki alanlarla, `created_by` isteği yapan kullanıcı), `next_hearing_date` 3.2'ye göre hesaplanır (geçmiş tarih verilirse etkinlik oluşur, alan `NULL` kalır).
- İçe aktarma ve seed: `next_hearing_date` değerleri aynı şekilde etkinliğe dönüştürülür (içe aktarmada aynı dava ve günde zaten `hearing` etkinliği varsa yenisi oluşturulmaz).
- Kapalı dava: davaya bağlı yeni `hearing` etkinliği oluşturma (takvimden veya dava sayfasından) ya da mevcut bir etkinliği kapalı davaya taşıma → 409 "Kapalı davaya duruşma eklenemez." Kapalı davanın mevcut duruşmalarını düzenleme/silme serbest (arşivli değilse). Arşivli dava için mevcut 409 kuralı geçerli.
- Takvimdeki türetilmiş `case_hearing` öğeleri kaldırılır (artık her duruşma gerçek etkinlik). Hatırlatmalar, yaklaşan duruşmalar listesi, raporlar ve dashboard, `next_hearing_date` ve etkinlikler üzerinden bugünkü gibi çalışır; kapalı/arşivli dava kuralları (case-lifecycle) korunur.

## 5. API

- Mevcut `/calendar/events` uçları duruşmalar için de kullanılır (oluşturma/güncelleme/silme). Yanıtlara `result_note` eklenir.
- `GET /cases/{id}/hearings` → davanın tüm `hearing` etkinlikleri, `starts_at`'e göre sıralı: `{ id, starts_at, all_day, duration_minutes, location, notes, assignee_id, result_note, is_past }` (`is_past`: etkinlik tarihi yerel bugünden önce). Başka büro 404.
- `POST /calendar/events/{id}/result` `{ result_note: str (1–4000, kırpılır), next_hearing?: { starts_at, all_day, duration_minutes?, location?, notes? } }`:
  - Etkinlik `hearing` türünde ve davaya bağlı olmalı (değilse 422 "Sonuç yalnızca davaya bağlı duruşmalara girilebilir."), tarihi bugünden sonra olmamalı (422 "Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.").
  - Arşivli dava 409 (mevcut mesaj). Kapalı dava: sonuç notu girilebilir, `next_hearing` verilirse 409 "Kapalı davaya duruşma eklenemez.".
  - `result_note` kaydedilir; zaman çizelgesi olayı yoksa oluşturulur (`event_date` = duruşma tarihi, başlık "Duruşma yapıldı — <gg.aa.yyyy>", açıklama = not, tür `hearing`, `created_by` işlemi yapan), varsa açıklaması güncellenir.
  - `next_hearing` verilirse aynı işlemde yeni `hearing` etkinliği oluşturulur (aynı dava, sorumlu = davanın avukatı, varsayılan hatırlatmalar), `next_hearing_date` yeniden hesaplanır.
  - Yanıt: `{ hearing, next_hearing | null }`.
- Duruşma etkinliği silinirse bağlı zaman çizelgesi olayı silinmez (geçmiş kayıt olarak kalır).

## 6. Arayüz

### 6.1 Dava sayfası — "Duruşmalar" kartı (Genel Bakış'ta)
- "Yaklaşan" ve "Geçmiş" listeleri: tarih, saat (tüm gün ise "Tüm gün"), salon/yer, not; geçmişte sonuç notu ("Sonuç: …") veya "Sonuç girilmedi".
- Butonlar: "Duruşma ekle"; satırda "Düzenle", "Sil"; geçmiş satırda "Sonuç gir" (sonuç varsa "Sonucu düzenle").
- Duruşma ekle/düzenle penceresi: Tarih*, Saat (veya "Tüm gün" kutusu), Süre, Salon / yer, Not. Takvimdeki etkinlik formunun alanlarıyla aynı kurallar.
- Sonuç penceresi: Sonuç / ara karar notu*, "Sonraki duruşmayı ekle" kutusu → işaretlenirse tarih/saat/salon alanları.
- Sil: onay penceresi "Duruşma silinsin mi?".
- Kapalı davada "Duruşma ekle" ve sonuç penceresindeki "Sonraki duruşmayı ekle" gizlenir; arşivli davada kart tamamen salt okunur.
- Genel Bakış'taki "Sonraki duruşma" alanı en yakın yaklaşan duruşmayı tarih + saatle gösterir ve karta bağlanır.
- Pencereler: `ModalFrame`, `aria-disabled` + guard, yalnızca `ApiError` mesajları (Türkçe yedek mesaj).

### 6.2 Takvim
- Davaya bağlı duruşma etkinlikleri bugünkü gibi düzenlenir; değişiklik dava sayfasına yansır. Etkinlik çekmecesinde `result_note` varsa "Sonuç" satırı gösterilir.

### 6.3 Yeni dava sayfası
- "Sonraki duruşma tarihi" alanı aynı kalır; kaydedilince duruşma etkinliğine dönüşür.

## 7. Test

- **Backend:** migration (dönüştürme, zaten etkinliği olan dava, avukatsız dava, kullanıcısız büro, yeniden hesaplama); `recompute_next_hearing` (ekle/taşı/tür değiştir/başka davaya taşı/sil, geçen duruşma, saat dilimi); gece yeniden hesaplama; `PATCH next_hearing_date` 422; `POST /cases` ve içe aktarmanın etkinlik oluşturması; kapalı davaya ekleme/taşıma 409; `GET /cases/{id}/hearings`; sonuç ucu (kurallar, olay oluşturma/güncelleme, sonraki duruşma, kapalı/arşivli); büro izolasyonu; hatırlatmalar ve yaklaşan duruşma listesinin doğru kalması; takvimde `case_hearing` öğesinin kalmaması.
- **Frontend:** Duruşmalar kartı (listeler, butonlar, salt okunur durumlar), ekle/düzenle/sil/sonuç pencereleri, Genel Bakış bağlantısı, takvim çekmecesindeki "Sonuç".
- **E2E:** Davadan duruşma eklenir → takvimde görünür → takvimden taşınır → dava sayfasında yeni tarih → geçmiş bir duruşmaya sonuç girilir ve sonraki duruşma eklenir → zaman çizelgesinde "Duruşma yapıldı" olayı görünür.
