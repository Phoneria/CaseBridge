# Tıklanabilir Değerler ve Dava Önizleme (Drill-down) — Tasarım

- **Tarih:** 2026-09-30
- **Dal:** `feature/clickable-drilldown`
- **Durum:** Onaylandı (brainstorming), uygulama planı bekleniyor

## 1. Problem

Uygulamadaki değerlerin çoğu tıklanamıyor. Dashboard "İcra: 3" diyor ama o 3 davaya ulaşılamıyor; "Yaklaşan Duruşmalar"daki "Ticari Kira Uyarlama Davası" satırı, takvimdeki olaylar, görevler ve belgeler listesindeki dava adları düz metin. Oysa bu öğelerin neredeyse hepsi API'den `case_id` ile geliyor — eksik olan yalnızca etkileşim katmanı.

Ek sorunlar:
- Raporlar sayfasındaki sayılar ("12 yaklaşan duruşma", "9 açık görev", "%62,5") ve 3 raporun CSV'si sabit mock veri.
- Dava detayındaki sekmeler URL'e yazılmıyor; başka ekrandan belirli bir sekmeye derin link verilemiyor.
- Backend `status` ve `case_type` filtrelerini desteklediği hâlde dava listesi UI'ı bunları kullanmıyor.
- Analitik servisi arşivlenmiş davaları sayıyor, dava listesi varsayılan olarak gizliyor → kart sayısı ile liste satır sayısı tutmayabiliyor.
- Dashboard "Yaklaşan Duruşmalar" geçmiş tarihli duruşmaları da gösterebiliyor.

## 2. Hedefler ve kapsam

**Hedef:** Her değer ya ilgili ayrıntıya götürsün ya da sayfadan çıkmadan hızlı önizleme açsın.

**Kapsamda:**
- Global dava önizleme paneli (`CaseQuickView`), URL tabanlı.
- Liste ekranlarında URL tabanlı filtreler (Davalar, Görevler, Belgeler).
- Dashboard, Takvim, Analitik, Raporlar'da tıklama eşlemeleri.
- Dava detayı sekmelerinin URL'e bağlanması.
- Küçük backend eklemeleri (filtreler, takvim `task_id`, belge indirme, rapor CSV'leri ve özet, `by_status`).
- Raporlar'ın gerçek veriye bağlanması.

**Kapsam dışı:**
- Panelden yerinde eylemler (görev tamamlama/ekleme, tarih değiştirme, sürükle-bırak).
- Sayfalama (yalnızca URL yapısında `sayfa` parametresine yer ayrılır).
- Simülasyonlar ve Ayarlar sayfaları (tek istisna: "Dosya analizleri" sekmesindeki dava adları önizleme linki alır).
- Veritabanı şema değişikliği / migration.

## 3. Mimari karar

**Seçilen yaklaşım: URL tabanlı global çekmece.** `AppShell` içinde tek bir `CaseQuickView`; URL'deki `?onizle=<davaId>` parametresini dinler. Sayfalar yalnızca link üretir.

Gerekçe: geri tuşu paneli kapatır, link paylaşılabilir, yenilemede korunur, tek bileşen her yerde kullanılır, testte URL'e bakmak yeterli.

Reddedilenler: React Context tabanlı çekmece (geri tuşu/paylaşım/yenileme yok); Next.js paralel/araya giren route'lar (`@modal`) — bu ihtiyaç için gereksiz karmaşık.

Aynı URL mantığı filtrelere de uygulanır.

### 3.1 Tıklama kuralı (tüm ekranlarda)

| Öğe türü | Davranış |
|---|---|
| Tek bir davaya işaret eden öğe (duruşma satırı, gelişme, takvim olayı, görev satırı, belge satırı) | Önizleme paneli açılır |
| Toplu değer (stat kartı, grafik çubuğu/dilimi, lejant, rapor kartı sayısı) | Filtrelenmiş listeye gider |
| Davalar listesindeki / Analitik kaybedilen listesindeki **dava adı** | Doğrudan dava detayına gider |
| Satırdaki dava adı (Görevler, Belgeler) | O dava için `dava` filtresini ekler |

### 3.2 Görsel dil

- Tıklanabilir her öğe gerçek bir `<Link>` (klavye, Cmd+tık yeni sekme).
- Hover: kenarlık accent rengi + köşede "→"; görünür odak halkası.
- Tıklanamayan değerler (ör. "Ort. Dava Süresi") hover efekti almaz.
- Boş alanlar "—" gösterilir ve tıklanabilir görünmez.

## 4. Bileşenler

### 4.1 Dava önizleme paneli — `components/CaseQuickView.tsx`

**Açılma/kapanma**
- `?onizle=<davaId>` varsa sağdan panel: masaüstünde ~440px, mobilde tam ekran.
- Açılış `router.push` (geri tuşu kapatır). Kapatma: ✕, ESC, arka plan tıklaması → parametre `router.replace` ile silinir.
- `useQuickViewHref()` ile üretilen linkler mevcut URL'i (filtreler dahil) koruyarak parametreyi ekler.
- Panel açıkken başka satıra tıklanırsa içerik yerinde yenilenir.

**İçerik (yukarıdan aşağı)**
1. Başlık: dava adı, dava no, durum rozeti, kategori.
2. Künye: müvekkil, karşı taraf, mahkeme, sonraki duruşma (7 gün içindeyse vurgulu).
3. Açık görevler: son tarihe göre en yakın 3 + "Tümü (n) →" (`/davalar/[id]?sekme=gorevler`).
4. Son gelişmeler: `timeline`'dan son 3 + "Tümü →" (`?sekme=gelismeler`).
5. Belgeler: en son 3 + toplam sayı (`?sekme=belgeler`).
6. Alt çubuk: "Davaya git →" + sekme kısayolları (Görevler · Belgeler · Gelişmeler · Simülasyonlar).

**Bağlam vurgusu:** isteğe bağlı `&odak=<tür>:<id>`; türler `gorev`, `belge`, `olay`. Vurgulanan öğe ilgili bölümde vurgulu gösterilir; ilk 3'te değilse bölümün en üstüne sabitlenir.

**Veri:** `getCase` (timeline dahil), `listCaseTasks`, `listDocuments` paralel çağrılır. Yeni endpoint yok.

**Durumlar:** yükleniyor → iskelet; hata → panel içinde "Tekrar dene"; 404 → "Dava bulunamadı veya erişiminiz yok" + kapat.

**Erişilebilirlik:** `role="dialog"`, `aria-modal="true"`, odak panelde tutulur, kapanınca tetikleyen öğeye döner.

### 4.2 Dava detayı sekmeleri — `CaseDetailView.tsx`

- Aktif sekme `?sekme=` parametresinden okunur; geçersiz/eksikse `genel`.
- Slug'lar: `genel`, `belgeler`, `gelismeler`, `gorevler`, `simulasyonlar`, `devir`, `notlar`.
- Sekme değişimi URL'i `router.replace` ile günceller.

### 4.3 URL durumu — `lib/urlState.ts`

- `useUrlFilters()`: parametreleri okur/günceller (`replace` ile; her tuş vuruşu geçmişe yazılmaz).
- `useQuickViewHref()` → `(caseId, odak?) => href` üreten bir fonksiyon döndürür.
- `parseOdak(value)` → `{ type: "gorev" | "belge" | "olay", id } | null`.
- `sayfa` parametresi ayrılmıştır (bu işte kullanılmaz; sayfalama ileride eklenecek).

### 4.4 Filtre eşleme — `lib/filters.ts` (tek kaynak)

URL slug'larını API parametrelerine çevirir ve link üretir. Dashboard/Analitik/Raporlar linkleri **yalnızca** buradaki üreticilerle (`caseListHref`, `taskListHref`, `documentListHref`) oluşturulur; böylece link ve filtre birbirinden kopamaz.

| URL (`/davalar`) | API (`GET /cases`) |
|---|---|
| `ara=<metin>` | `search` |
| `kategori=<case_type>` | `case_type` |
| `durum=<status>` | `status` |
| `durum=aktif` | `active=true` |
| `sonuc=kazanilan \| kaybedilen \| sulh \| devam` | `outcome=won \| lost \| settled \| ongoing` |
| `durusma=yaklasan` | `hearing_within_days=30` |
| `arsiv=dahil` | `include_archived=true` |

`/gorevler`: `durum=acik|tamamlanan`, `vade=7gun|gecikmis`, `dava=<id>` (istemci tarafında; görev listesi zaten tüm bekleyen+tamamlanan görevleri döndürüyor).
`/belgeler`: `ara`, `tur=<file_type>`, `dava=<id>` (istemci tarafında).
`/takvim`: `ay=YYYY-MM`, `goster=durusma|gorev` (yoksa ikisi de).

### 4.5 Ortak küçük bileşenler

- `components/FilterChips.tsx`: aktif filtre çipleri ("Kategori: İcra ✕"), "Filtreleri temizle", "n sonuç" sayacı. `arsiv=dahil` → "Arşiv dahil ✕".
- `components/ChartLegendLinks.tsx`: grafik altında klavyeyle erişilebilir link lejantı ("İcra · 3"). SVG çubuklar odaklanamadığı için gerekli.
- `StatCard`: isteğe bağlı `href`; verilirse `<Link>` olarak render edilir.

## 5. Ekran ekran değişiklikler

### 5.1 Tutarlılık kuralı

Bir karttaki sayı, tıklanınca açılan listenin satır sayısına **eşit** olmalıdır. Filtre tanımları analitik servisiyle birebir aynıdır (`aktif` = `status != kapali`, `kazanilan` = `outcome == won` …). Analitik arşivli davaları saydığı için analitik kaynaklı tüm linkler `arsiv=dahil` taşır.

### 5.2 Dashboard

| Öğe | Hedef |
|---|---|
| Aktif Davalar | `/davalar?durum=aktif&arsiv=dahil` |
| Toplam Davalar | `/davalar?arsiv=dahil` |
| Kazanılan | `/davalar?sonuc=kazanilan&arsiv=dahil` |
| Kaybedilen | `/davalar?sonuc=kaybedilen&arsiv=dahil` |
| Kazanma Oranı | `/analitik` |
| Dava Dağılımı çubuğu + lejant | `/davalar?kategori=<x>&arsiv=dahil` |
| Durum pastası dilimi + (yeni) lejant | `/davalar?durum=<x>&arsiv=dahil` |
| Yaklaşan Duruşmalar satırı | önizleme |
| Yaklaşan Duruşmalar "Tümü →" | `/davalar?durusma=yaklasan` |
| Son Gelişmeler öğesi | önizleme, `odak=olay:<id>` |

- Durum pastası artık istemcide sayım yapmaz; `AnalyticsOverview.by_status`'tan beslenir.
- Yaklaşan Duruşmalar yalnızca bugün ve sonrasını gösterir (hata düzeltmesi); 7 gün içindekiler vurgulu.

### 5.3 Davalar (`/davalar`)

- Arama + Kategori / Durum / Sonuç açılır menüleri; hepsi URL'e yazılır.
- `FilterChips` tablonun üstünde.
- Yeni sütun: "Sonraki Duruşma".
- Kategori ve durum rozetleri tıklanınca o filtreyi ekler.
- Satır tıklaması → önizleme; dava adı → detay.
- Filtre sonucu boşsa: "Bu filtrelere uyan kayıt yok" + "Filtreleri temizle" (genel "Henüz dava yok" durumundan ayrı).

### 5.4 Görevler (`/gorevler`)

- Kartlar filtre butonu: Açık (`durum=acik`), Tamamlanan (`durum=tamamlanan`), 7 gün içinde (`vade=7gun`), **yeni** Gecikmiş (`vade=gecikmis`, kırmızı; son tarihi geçmiş açık görevler). Aktif kart vurgulu; tekrar tıklayınca filtre kalkar.
- Satırdaki dava adı → `dava` filtresi; satırın geri kalanı → önizleme `odak=gorev:<id>`.
- Checkbox mevcut davranışı korur; tıklaması satıra yayılmaz (`stopPropagation`).
- Sıralama: gecikmişler üstte, sonra son tarihe göre artan; tarihsizler en altta.

### 5.5 Belgeler (`/belgeler`)

- Filtreler: `ara` (dosya adı), `tur`, `dava`.
- Satır → önizleme `odak=belge:<id>`; dava adı → `dava` filtresi.
- "İndir" butonu (yeni endpoint; auth header gerektiği için Blob ile).

### 5.6 Takvim (`/takvim`)

- Duruşma kutucuğu → önizleme; görev kutucuğu → önizleme `odak=gorev:<task_id>`.
- Günde 3'ten fazla olay: ilk 3 + "+n daha" → o günün tüm olaylarını listeleyen popover.
- Görünen ay `?ay=YYYY-MM` ile URL'de.
- Lejant ("Duruşma", "Görev") aç/kapa filtresi (`?goster=`).
- Takvim yalnızca bekleyen görevleri gösterir (mevcut davranış korunur).

### 5.7 Analitik (`/analitik`)

- Kartlar Dashboard ile aynı hedefler; bu sayfada "Kazanma Oranı" (kendi sayfasına gideceği için) ve "Ort. Dava Süresi" tıklanmaz.
- Kategori başarı grafiği çubuğu + lejant → `/davalar?kategori=<x>&arsiv=dahil`.
- Kaybedilen davalar: satır → önizleme; dava adı → detay.

### 5.8 Raporlar (`/raporlar`)

- Kart sayıları `GET /reports/summary`'den canlı:

| Kart | Sayı | Hedef |
|---|---|---|
| Dava Listesi | `total_cases` | `/davalar?arsiv=dahil` |
| Duruşma Takvimi | `upcoming_hearings_30d` | `/davalar?durusma=yaklasan` |
| Görev Durumu | `open_tasks` | `/gorevler?durum=acik` |
| Performans | `win_rate` | `/analitik` |

- 4 raporun hepsi gerçek CSV indirir; `mockReportCsv` ve "Bugün güncellendi" metinleri kaldırılır; buton etiketi her kartta "CSV Olarak İndir".

### 5.9 Simülasyonlar

- Yalnızca "Dosya analizleri" sekmesindeki dava adları önizleme linki alır.

## 6. Backend eklemeleri

DB şeması değişmez. Tüm yeni endpoint'ler `get_current_law_firm_id` kullanır.

1. **Dava listesi filtreleri** — `GET /cases`: `outcome`, `active: bool`, `hearing_within_days: int (1–365)`. `case_repository.list_in_firm` → `case_service.list_cases` → `routes/cases.py` zinciri üzerinden; kiracı filtresi değişmez. `hearing_within_days`: `today <= next_hearing_date <= today + N`.
2. **Analitik** — `AnalyticsOverview`'a `by_status: list[{status, total}]` eklenir (mevcut `by_category` ile aynı taban sorgu).
3. **Takvim** — `CalendarEventOut`'a `task_id: Optional[str]`; görev olaylarında dolu, duruşmalarda `None`.
4. **Belge indirme** — `GET /documents/{id}/download`: `FileResponse`, orijinal ad `Content-Disposition` ile. Belge kiracıya göre bulunur; başka büronun belgesi ve diskte olmayan dosya için aynı 404. Çözümlenen yolun `settings.storage_dir` içinde kaldığı doğrulanır.
5. **Raporlar** — `ReportService`: `hearings_csv`, `tasks_csv`, `performance_csv`, `summary`. Route'lar: `/reports/hearings.csv`, `/reports/tasks.csv`, `/reports/performance.csv` (UTF-8 BOM ve Türkçe başlıklar; mevcut `cases.csv` biçimi değişmez), `GET /reports/summary` → `{ total_cases, upcoming_hearings_30d, open_tasks, win_rate }`. `total_cases` ve `win_rate` analitik servisiyle aynı tanımı kullanır (arşiv dahil). `upcoming_hearings_30d` `GET /cases?hearing_within_days=30` ile, `open_tasks` `GET /tasks?status=pending` ile aynı tanımı kullanır; böylece §5.1 tutarlılık kuralı Raporlar kartları için de geçerlidir.
6. **Son gelişmeler** — değişiklik yok (`id`, `case_id` zaten mevcut).

## 7. Gerçek veriye hazırlık

Bir sonraki işte seed yerine gerçek veri kullanılacak. Bu tasarım veri kaynağından bağımsızdır; ek olarak:
- Sayılar her zaman backend toplamlarından gelir; yeni istemci tarafı sayım eklenmez.
- URL'de `sayfa` parametresi ayrılmıştır; sayfalama ayrı iş.
- Boş/eksik alanlar (mahkeme, karşı taraf, duruşma tarihi) "—" ile gösterilir, tıklanabilir görünmez.
- Tutarlılık testi (§8) gerçek veriye geçişte de kart/liste uyumunu doğrular.

## 8. Dosya yapısı

**Yeni (frontend):** `lib/urlState.ts`, `lib/filters.ts`, `components/CaseQuickView.tsx`, `components/FilterChips.tsx`, `components/ChartLegendLinks.tsx`.

**Değişen (frontend):** `AppShell`, `StatCard`, `DashboardView`, `CaseListView`, `TasksView`, `DocumentsView`, `CalendarView`, `AnalyticsView`, `ReportsView`, `CaseDetailView`, `SimulationsView` (yalnızca link), `lib/api.ts`, `types/index.ts`. `useSearchParams` için gereken `<Suspense>` sınırı tek seferde `AppShell` içine eklenir (Next 14 build gereği).

**Değişen (backend):** `repositories/case_repository.py`, `services/case_service.py`, `api/routes/cases.py`, `schemas/analytics.py`, `services/analytics_service.py`, `schemas/calendar.py`, `api/routes/calendar.py`, `api/routes/documents.py`, `services/document_service.py`, `services/report_service.py`, `api/routes/reports.py`.

## 9. Test planı

**Backend (`backend/tests/api/`)**
- `test_cases.py`: `outcome`, `active`, `hearing_within_days` filtreleri (sınır günleri dahil). **Tutarlılık testi:** arşivli dava dahil seed'lenmiş veride analitik `won_cases`/`lost_cases`/`active_cases`/`by_category`/`by_status` sayıları, karşılık gelen `arsiv=dahil` liste filtresinin satır sayısına eşit.
- `test_analytics.py`: `by_status`.
- `test_calendar.py`: görev olaylarında `task_id` dolu, duruşmalarda `None`.
- `test_documents.py`: indirme 200 + doğru içerik ve ad; başka büronun belgesi 404; diskte olmayan dosya 404.
- `test_reports.py`: 3 yeni CSV'nin başlık/içerik ve BOM'u; `summary` sayıları.

**Frontend (Vitest, `next/navigation` mock'lu)**
- `lib/__tests__/filters.test.ts`: slug ↔ API parametresi dönüşümleri ve gidiş-dönüş; link üreticileri.
- `components/__tests__/CaseQuickView.test.tsx`: yükleniyor / veri / 404 / hata; `odak` vurgusu ve sabitleme; ESC ile kapanma.
- Mevcut testlere eklemeler: Dashboard kart/çubuk/satır `href`'leri; CaseList ve Tasks'ta URL filtresinin API çağrısına/listeye yansıması; Tasks checkbox'ının önizleme açmaması; Calendar "+n daha" popover'ı ve `ay` parametresi; CaseDetail `sekme` parametresi; Reports canlı sayılar.

**E2E (Playwright)** — `tests/e2e/specs/05-click-through.spec.ts`: Dashboard'da "İcra" çubuğu → liste filtrelenir ve satır sayısı kartla eşleşir → satır → panel açılır → "Görevler" kısayolu → dava detayında Görevler sekmesi aktif → geri tuşu listeye döner.

## 10. Uygulama sırası

1. Backend filtreleri, `by_status`, takvim `task_id`, belge indirme, rapor endpoint'leri (+ testler).
2. `lib/filters.ts` + `lib/urlState.ts` (+ testler).
3. `CaseQuickView` + `AppShell` entegrasyonu + `CaseDetailView` sekme URL'i.
4. Liste ekranları: Davalar, Görevler, Belgeler.
5. Dashboard, Takvim, Analitik, Raporlar, Simülasyonlar linkleri.
6. E2E senaryosu.

Her adım bağımsız test edilebilir ve ayrı commit'lenir.
