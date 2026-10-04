# Görevler Sayfasından Yeni Görev — Tasarım

- **Tarih:** 2026-10-04
- **Dal:** `feature/calendar-reminders`
- **Durum:** Onaylandı (kapsam: yalnızca Görevler sayfası; takvim ve dava detayı değişmez)

## 1. Amaç

Görevler sayfasında görev oluşturulamıyor; görevler yalnızca dava detayından eklenebiliyor. Görevler sayfasına "Yeni görev" butonu ve formu eklenir.

## 2. Kararlar

| Konu | Karar |
|---|---|
| Kapsam | Yalnızca Görevler sayfası. Takvimden yalnızca takvim etkinliği oluşturulmaya devam eder; dava detayındaki satır içi form değişmez. |
| Dava | Zorunlu. Görev her zaman bir davaya bağlı (mevcut model). |
| Alanlar | Başlık, dava, açıklama, son tarih, atanan kişi, hatırlatma. |
| Düzenleme | Kapsam dışı (yalnızca oluşturma). |

## 3. Backend

- `TaskCreate` (`POST /cases/{case_id}/tasks`) `reminder_days` alanını kabul eder (`ReminderDays`, isteğe bağlı; verilmezse `NULL` → varsayılan `[1]`; `[]` → hatırlatma yok). Doğrulama `TaskUpdate`/takvim etkinliğiyle aynı: değerler 0–30, tekrarsız, büyükten küçüğe.
- `TaskCreate.title`: boşlukları kırpılır, 1–200 karakter; aksi 422. (Mevcut dava detayı formu da bu doğrulamadan geçer.)
- Mevcut kurallar korunur: dava başka bürodaysa 404; atanan kişi başka bürodaysa 404 "Kullanıcı bulunamadı".

## 4. Frontend

- `createTask(caseId, payload)` yükü genişler: `{ title, description?, due_date?, assigned_to?, reminder_days? }`.
- Yeni `components/tasks/TaskFormModal.tsx` (modal, `role="dialog"`, `aria-modal`, başlık "Yeni görev"):
  - Alanlar: Başlık (zorunlu, en fazla 200), Dava (`CaseSearchSelect`, zorunlu), Açıklama (textarea), Son tarih (date), Atanan kişi (`listUsers()`; "Atanmadı" seçeneği), Hatırlatma (`ReminderPicker`, varsayılan `[1]`; son tarih boşken devre dışı ve gönderilmez).
  - Doğrulama mesajları (Türkçe): "Başlık gerekli.", "Başlık en fazla 200 karakter olabilir.", "Dava seçin."
  - Kaydet → `createTask(caseId, payload)`; başarıda `onCreated(task)`; hata → `role="alert"` "Görev eklenemedi: <detay>" (backend detayı varsa).
  - Erişilebilirlik: açılınca başlık alanına odak, kapanınca önceki odağa dönüş; kaydederken Escape, "Vazgeç" ve ✕ devre dışı.
  - Davalar (`getCases()`) ve kullanıcılar (`listUsers`) modal açılınca yüklenir; yüklenemezse form içinde hata gösterilir.
- `TasksView`:
  - Başlık satırına "Yeni görev" butonu (her durumda görünür, boş listede de).
  - Görev oluşunca listeye eklenir (dava adı/numarası seçilen davadan doldurulur) — ya da liste yeniden yüklenir; filtreler korunur.
  - Boş durum ipucu: "İlk görevi 'Yeni görev' ile ekleyin." (eski "Görevler bir davanın Görevler sekmesinden eklenir." yerine).
  - URL'de `dava=` filtresi varsa form o davayla önceden seçili açılır.

## 5. Test

- **Backend:** oluştururken `reminder_days` kaydedilir ve yanıtta döner; `reminder_days` verilmezse `null`; geçersiz değer 422; başlık boş/201 karakter 422, kırpılır; başka büronun davası 404; başka büronun kullanıcısı 404.
- **Frontend:** "Yeni görev" butonu modalı açar; doğrulama mesajları; doğru yükle `createTask` çağrısı (son tarih yokken `reminder_days` gönderilmez); başarıda yeni görev listede görünür ve modal kapanır; hata mesajı; `dava=` filtresiyle önceden seçili dava.
- **E2E:** Görevler sayfasından görev ekle → listede ve takvimde (son tarih gününde) görünür.
