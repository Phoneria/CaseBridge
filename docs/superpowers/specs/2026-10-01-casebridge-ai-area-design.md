# CaseBridge AI Alanı — Tasarım

- **Tarih:** 2026-10-01
- **Dal:** `feature/casebridge-ai` (`feature/clickable-drilldown` üzerine)
- **Durum:** Onaylandı (brainstorming), uygulama planı bekleniyor

## 1. Problem

CaseBridge'in AI modülü iki ayrı ürün barındırıyor:

1. **Dosya Analizi:** bir dava için hakim, davacı vekili, davalı vekili ve hukuk araştırmacısı perspektiflerinden karar destek raporu.
2. **Canlı Duruşma:** yerel modelin karşı taraf vekilini ve hakimi oynadığı, altı aşamalı, 100 puanla değerlendirilen kurgusal duruşma.

Bugün ikisi de sidebar'da Belgeler ile Analitik arasında sıradan bir "Simülasyonlar" öğesi altında, iki sekme olarak duruyor. Görünümleri diğer sayfalarla aynı; dava detayında küçük kesikli bir kutu dışında uygulamanın geri kalanında AI'a dair bir iz yok. Sonuç: başlı başına büyük bir özellik olan AI, diğer özelliklerin arasında kayboluyor.

## 2. Hedef ve kapsam

**Hedef:** AI modülü "CaseBridge AI" adıyla kendi menü bloğu, kendi adresi, kendi giriş sayfası ve tanınır bir görsel kimlikle ayrı bir ürün gibi algılansın; uygulamanın en çok kullanılan yerlerinde (Dashboard, dava detayı, önizleme paneli) görünür olsun.

**Kapsamda:**
- `/ai` altında yeni rota yapısı ve eski `/simulasyonlar` adreslerinden yönlendirme.
- Sidebar'da ayrı "✦ CaseBridge AI" bloğu.
- AI görsel sistemi: `AiMark`, `AiHero`, `AiCard`, `AiBadge`.
- `/ai` giriş sayfası, `/ai/analiz`, `/ai/durusma` sayfaları.
- AI alanından dosya analizi başlatma (dava seçici).
- Giriş noktaları: Dashboard AI kartı, dava detayında AI sekmesi ve Genel Bakış AI kartı, önizleme panelinde AI satırı.

**Kapsam dışı:**
- Backend değişikliği (tüm veriler mevcut endpoint'lerden gelir).
- Dava listesine AI skoru sütunu (skor bir AI tahmini; gerçek verilerle yan yana kesin bilgi gibi okunur).
- Tüm sayfayı koyu temaya çeviren "AI modu".
- Duruşma oturumu sayfasının içeriğinde değişiklik (yalnızca başlık çubuğu ve geri linki).
- AI modelleri, prompt'lar veya analiz içeriğinde değişiklik.

## 3. Bilgi mimarisi ve rotalar

| Adres | İçerik | Bugünkü karşılığı |
|---|---|---|
| `/ai` | CaseBridge AI giriş sayfası | yok |
| `/ai/analiz` | Dosya Analizi: yeni analiz + tüm raporlar | "Dosya analizleri" sekmesi |
| `/ai/durusma` | Canlı Duruşma: oturumlarım + senaryolar | "Canlı duruşma" sekmesi |
| `/ai/durusma/oturum/[id]` | Duruşma oturumu | `/simulasyonlar/oturum/[id]` |

**Yönlendirmeler** (`next.config.mjs`, kalıcı/308):
- `/simulasyonlar` → `/ai`
- `/simulasyonlar/oturum/:id` → `/ai/durusma/oturum/:id`

**Sidebar:**
- Normal menüden "Simülasyonlar" öğesi kaldırılır.
- Normal menünün altında, ayraçla ayrılmış koyu zeminli (`navy-950` + `bg-ai-glow`) "✦ CaseBridge AI" bloğu:
  - Blok başlığı `/ai`'a link.
  - Alt öğeler: "Dosya Analizi" (`/ai/analiz`), "Canlı Duruşma" (`/ai/durusma`).
- Aktiflik: başlık yalnızca `/ai` tam eşleşmede; alt öğeler kendi adresleri ve alt yolları için (`/ai/durusma/oturum/...` → "Canlı Duruşma"). Blok, herhangi bir `/ai...` adresinde vurgulu çerçeve alır.
- "Ayarlar" en altta kalır.

**Dava detayı sekmesi:**
- "Simülasyonlar" sekmesi "✦ CaseBridge AI" olur; slug `simulasyonlar` → `ai`.
- `parseCaseTab("simulasyonlar")` geriye uyumluluk için `"ai"` döner.
- `CASE_TAB_SLUGS` içinde `simulasyonlar` yerine `ai` yer alır.

## 4. Görsel sistem (`frontend/src/components/ai/`)

| Bileşen | Tanım |
|---|---|
| `AiMark` | Mor ✦ SVG ikonu; `withLabel` ile yanında "CaseBridge AI" yazısı. İkon `aria-hidden`. |
| `AiHero` | `navy-950` zemin, `bg-ai-glow` (sağ üst ve sol altta `accent-500/600` radyal gradyan). Props: `eyebrow?`, `title`, `description?`, `actions?` (ReactNode), `stats?` (`{label, value}[]`), `compact?`. Metinler beyaz/`accent-200`, WCAG AA kontrast. Parıltıda hafif animasyon; `motion-reduce:animate-none`. |
| `AiCard` | 1px gradyan çerçeveli (`bg-ai-border`: `accent-400` → `accent-600` → `navy-800`) beyaz kart. Props: `children`, `disclaimer?` (alt satırda küçük gri metin), `className?`. |
| `AiBadge` | Küçük "✦ AI" etiketi (mor zemin, küçük punto). |

**Kural:** ✦ işareti, `AiCard` ve `AiBadge` yalnızca AI'ın ürettiği ya da AI'ı başlatan öğelerde kullanılır.

**Uyarı:** AI çıktılarında mevcut "AI tahmini, kesin sonuç değildir" uyarısı korunur; `AiCard`'ın `disclaimer` satırıyla tek tip gösterilir.

**Tailwind:** `tailwind.config.ts`'e `backgroundImage.ai-glow`, `backgroundImage.ai-border` ve `animation.ai-glow` (+ keyframes) eklenir. Yeni renk ve npm paketi yok.

## 5. Sayfalar

Tüm sayfalar mevcut endpoint'leri kullanır: `listAllSimulations`, `listCourtroomSessions`, `listCourtroomScenarios`, `createCourtroomSession`, `getAiStatus`, `getCases`, `startSimulation`.

### 5.1 `/ai` — giriş sayfası (`AiHubView`)

1. **Hero:**
   - Başlık "CaseBridge AI"; açıklama "Davalarınızı dört farklı perspektiften analiz edin, gerçekçi duruşma pratiği yapın."
   - İstatistikler: tamamlanan analiz sayısı, duruşma oturumu sayısı, son duruşma puanı (yoksa "—").
   - Model durumu satırı (`getAiStatus`): `configured` ise "Model: \<provider\> · Hazır"; değilse sarı uyarı "AI modeli yapılandırılmamış" + `/ayarlar` linki. `getAiStatus` hata verirse satır gösterilmez.
2. **İki ürün kartı** (`AiCard`, masaüstünde yan yana, mobilde alt alta):
   - **Dosya Analizi:** açıklama; perspektif çipleri "Hakim", "Davacı vekili", "Davalı vekili", "Araştırmacı"; birincil "Analiz başlat" → `/ai/analiz`; ikincil "Raporları gör" → `/ai/analiz#raporlar`.
   - **Canlı Duruşma:** "6 aşama · 100 puanlık değerlendirme"; birincil "Duruşmaya gir" → `/ai/durusma`. `activeSession` varsa birincil buton "Devam et: \<senaryo adı\>" → `/ai/durusma/oturum/<id>`.
3. **Son AI aktivitesi:** `mergeRecentAiActivity(sims, sessions, 6)`; analiz satırı → `/davalar/<case_id>?sekme=ai`, oturum satırı → `/ai/durusma/oturum/<id>`. Boşsa iki ürüne yönlendiren boş durum.

### 5.2 `/ai/analiz` — Dosya Analizi (`AnalysisView`)

1. **Kompakt hero:** "Dosya Analizi", istatistik: analiz sayısı.
2. **"Yeni analiz" kartı** (`AiCard`, `id="yeni"`):
   - `CaseSearchSelect`: `getCases({ active: true })` ile yüklenen, metinle filtrelenen (dava adı/no/müvekkil, `tr-TR` küçük harf) seçici.
   - `?dava=<id>` varsa o dava önseçili gelir.
   - "Analizi başlat": `startSimulation(caseId)` → başarılıysa `router.push("/davalar/<id>?sekme=ai")`.
   - Hata kartın içinde gösterilir; `ApiError` status 503 ise "Model yanıt vermiyor, Ayarlar'daki AI durumunu kontrol edin.", diğerlerinde "Analiz başlatılamadı. Lütfen tekrar deneyin."
   - Dava seçilmeden buton devre dışı.
3. **Rapor listesi** (`id="raporlar"`): `listAllSimulations`, en yeni üstte. Her raporun başlığında dava adı (önizleme linki, `useQuickViewHref`) ve tarih; tamamlanmışsa `SimulationResultCard`, değilse durum rozeti (Bekliyor/Çalışıyor/Başarısız + hata mesajı).

### 5.3 `/ai/durusma` — Canlı Duruşma (`CourtroomLobbyView`)

1. **Kompakt hero:** "Canlı Duruşma", istatistikler: oturum sayısı, en yüksek puan (`bestScore`, yoksa "—").
2. **Oturumlarım:** devam eden (`status === "active"`) oturumlar en üstte ve "Devam et" vurgulu; kartlar `<Link href="/ai/durusma/oturum/<id>">`.
3. **Senaryolar:** mevcut `ScenarioCard` (ayrı dosyaya taşınır); "Davacı ol / Davalı ol" → `createCourtroomSession` → `router.push("/ai/durusma/oturum/<id>")`.

### 5.4 Oturum sayfası

`CourtroomSessionView` içeriği değişmez. Geri linki `/ai/durusma` olur; üstüne ince bir başlık çubuğu ("✦ CaseBridge AI · Canlı Duruşma") eklenir.

## 6. Uygulama içi giriş noktaları

### 6.1 Dashboard — `DashboardAiCard`

- Stat kartlarının hemen altında, grafiklerden önce, tam genişlikte `AiCard`.
- Üç sütun (mobilde alt alta):
  1. **Son dosya analizi** (`latestCompletedAnalysis`): dava adı, "%\<skor\>" + güven etiketi, tarih, "Raporu aç" → `/davalar/<case_id>?sekme=ai`. Yoksa "Henüz analiz yok".
  2. **Son duruşma** (en son güncellenen oturum): senaryo adı, puan ya da "Devam ediyor", oturum linki. Yoksa "Henüz oturum yok".
  3. **Kısayollar:** "✦ Dosya analizi başlat" → `/ai/analiz`, "Duruşmaya gir" → `/ai/durusma`.
- **Hata izolasyonu:** kart kendi verisini (`listAllSimulations`, `listCourtroomSessions`) Dashboard'un ana isteklerinden bağımsız çeker. Hata olursa yalnızca kartta "AI verileri yüklenemedi." yazar; kısayollar yine görünür; Dashboard'un geri kalanı etkilenmez.

### 6.2 Dava detayı

- **Sekme:** "✦ CaseBridge AI" etiketi, `AiMark` ve mor vurgu. Sekme içeriğinin üstünde AI şeridi: dört perspektifin adı ve "Analiz başlat" / "Yeniden analiz et" butonu (mevcut `handleStartSimulation`). Altında mevcut analiz listesi.
- **Genel Bakış — `CaseAiSummaryCard`:** bugünkü kesikli kutunun yerine. Props ile mevcut `simulations` ve `simulationRunning` durumunu alır; yeni istek atmaz. Üç durum:
  - **Tamamlanmış analiz var:** skor, güven, özetin ilk iki satırı (`line-clamp-2`), tarih, "Raporu aç" (AI sekmesine geçer), "Yeniden analiz et".
  - **Analiz sürüyor** (`simulationRunning` veya terminal olmayan bir simülasyon): "Analiz sürüyor…" + ilerleme göstergesi.
  - **Analiz yok:** kısa açıklama + "Analizi başlat".

### 6.3 Dava önizleme paneli

- Künyenin altına AI satırı:
  - Tamamlanmış analiz varsa: `AiBadge` + "Son AI değerlendirmesi: %\<skor\> · \<tarih\>" + "Analize git" → `caseDetailHref(id, "ai")`.
  - Yoksa: "Henüz AI analizi yok" + "Analiz başlat" → `/ai/analiz?dava=<id>`.
- Panel bunun için `listSimulations(caseId)` çağırır; bu çağrı başarısız olursa yalnızca AI satırı gizlenir, panelin geri kalanı etkilenmez.
- Sekme kısayollarında "Simülasyonlar" → "✦ AI" (`ai` slug'ı).

## 7. Ortak yardımcılar — `frontend/src/lib/ai.ts`

- `latestCompletedAnalysis(sims: Simulation[]): Simulation | null` — `status === "completed"` ve `result` olanlardan en yeni `completed_at`/`started_at`.
- `activeSession(sessions: CourtroomSessionSummary[]): CourtroomSessionSummary | null` — `status === "active"` olanlardan en son güncellenen.
- `bestScore(sessions): number | null` — `total_score` en yüksek olan.
- `mergeRecentAiActivity(sims: SimulationWithCase[], sessions, limit): AiActivityItem[]` — `{ kind: "analysis" | "session", id, title, subtitle, date, href }` listesi, tarihe göre azalan, `limit` ile kesilmiş.
- `SIMULATION_STATUS_LABELS`, `COURTROOM_STATUS_LABELS` (mevcut etiketler buraya taşınır).

## 8. Dosya yapısı

**Yeni (frontend):** `components/ai/AiMark.tsx`, `AiHero.tsx`, `AiCard.tsx`, `AiBadge.tsx`, `AiHubView.tsx`, `AnalysisView.tsx`, `CaseSearchSelect.tsx`, `CourtroomLobbyView.tsx`, `ScenarioCard.tsx`, `DashboardAiCard.tsx`, `CaseAiSummaryCard.tsx`; `lib/ai.ts`; `app/ai/page.tsx`, `app/ai/analiz/page.tsx`, `app/ai/durusma/page.tsx`, `app/ai/durusma/oturum/[id]/page.tsx`.

**Kaldırılan:** `app/simulasyonlar/**`, `components/SimulationsView.tsx` ve testi (testler yeni görünümlere taşınır).

**Değişen:** `Sidebar.tsx`, `DashboardView.tsx`, `CaseDetailView.tsx`, `CaseQuickView.tsx`, `CourtroomSessionView.tsx`, `lib/filters.ts`, `next.config.mjs`, `tailwind.config.ts`, ilgili mevcut testler ve E2E spec'leri.

**Backend:** değişiklik yok.

## 9. Test planı

**Vitest**
- `lib/ai.ts`: son tamamlanan analiz seçimi (devam eden/başarısız atlanır), `activeSession`, `bestScore`, `mergeRecentAiActivity` sıralama + limit + href'ler.
- `AiHubView`: istatistikler; model yapılandırılmamış uyarısı; aktif oturumda "Devam et"; aktivite linkleri; boş durum.
- `AnalysisView`: `?dava=` önseçimi; başlatınca `startSimulation` + `router.push("/davalar/<id>?sekme=ai")`; 503 ve genel hata mesajları; seçim yokken buton devre dışı.
- `CaseSearchSelect`: Türkçe büyük/küçük harf duyarsız arama.
- `CourtroomLobbyView`: aktif oturum en üstte; oturum kartları `<Link>`; oturum oluşturma yönlendirmesi.
- `DashboardAiCard`: AI endpoint hatasında yalnızca kartta hata; son analiz/duruşma; kısayol href'leri. `DashboardView` testinde AI kartı mock'lanarak ana Dashboard'un AI hatasından etkilenmediği doğrulanır.
- `CaseDetailView`: `?sekme=ai` ve `?sekme=simulasyonlar` aynı sekmeyi açar; `CaseAiSummaryCard` üç durumu.
- `CaseQuickView`: AI satırı (var/yok); `listSimulations` hatasında satır gizli.
- `Sidebar`: AI bloğu; `/ai`, `/ai/analiz`, `/ai/durusma/oturum/x` adreslerinde doğru aktiflik.
- `filters.ts`: `parseCaseTab("simulasyonlar") === "ai"`, `caseDetailHref(id, "ai")`.

**E2E (Playwright)**
- Mevcut spec'lerdeki "Simülasyonlar" sekme/link referansları güncellenir.
- Yeni `06-casebridge-ai.spec.ts`:
  1. Dashboard AI kartından "Duruşmaya gir" → `/ai/durusma`.
  2. `/simulasyonlar` → `/ai` yönlendirmesi.
  3. `/ai/analiz`'de dava seçip analiz başlat → `/davalar/<id>?sekme=ai`, AI sekmesi aktif.

**Doğrulama:** backend `pytest`, frontend `vitest`, `tsc`, `npm run build`, E2E; `/ai`, `/ai/analiz`, `/ai/durusma` sayfalarının masaüstü ve 390px genişlikte ekran görüntüsüyle görsel kontrolü (hero ve kartlar taşmıyor, kontrast yeterli).
