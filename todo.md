# CaseBridge release TODO

Updated: 22 November 2026.

## Gösterim bürosu için bekleyen düzenlemeler

- [ ] Olasılık ağacında aşamaları dava türüne uygun sırada göster. Fare düğümün üzerine geldiğinde düğüm hafifçe yükselsin ve parlasın, izlenen yol belirginleşsin. Dalları ayırt edilebilir renklerle çiz. Bağlantı okları kaynak düğümden hedef düğüme açıkça yönelsin ve yüzde etiketlerini örtmesin. Bir düğüm seçildiğinde o aşamanın açıklaması, ilgili adımları ve doğrudan açılabilen dava belgeleri gösterilsin. Aynı seçim klavye ve dokunmayla da yapılabilsin.
- [ ] Genel Bakış’taki dava durumu halka grafiğinin merkezinde grafiğe dahil toplam dava sayısını göster. Dava dağılımı çubuklarının üstüne her çubuğun temsil ettiği dava sayısını yaz.
- [ ] 20 gösterim davasının her birinde tarafları, duruşma bilgilerini ve dosyayla ilgili görevleri dava detayında görünür yap. Görevlerde açık ve tamamlanmış işleri dosyanın aşamasına uygun göster. Duruşmasız sonuçlanan dosyada (örneğin KYOK) bu bölümde sebebini ve dosyayı sonuçlandıran işlemi göster.
- [ ] Davalar → Belgeler içinde belge önizlemesini tam sayfaya yayılan, başlıkları, paragrafları ve listeleri belirgin bir Markdown okuma görünümüne dönüştür. İndirilebilir PDF ile aynı belgenin içeriğini göster.
- [ ] 20 davanın her biri için ayrı bir olasılık ağacı hazırla. Her ağaçta en az 50 anlamlı düğüm ve en az 5 farklı aşama olsun (hedef 5–10 aşama). Kullanıcının paylaştığı “Ceza Davaları Aşamaları” ve “Hukuk Davaları Aşamaları” listelerini esas al. İlk müvekkil görüşmesinden başlayarak müvekkil onayı, başvuru, deliller, duruşmalar, karar ve dosyaya uygun kanun yollarındaki alternatifleri adım adım dallandır. Her dalda o aşamadan geçiş yüzdesini, her yolda başlangıçtan itibaren o yolun gerçekleşme yüzdesini göster. Gösterim yüzdelerini senaryo varsayımı olarak belirt. Gerçekleşen yolu ilgili dava evrakına bağla.
- [ ] İş Hukuku, Kira ve Ticaret Hukuku örneklerinde kazanılan ve kaybedilen davalara yer ver. Analitikteki yüzdeler kayıtlı sonuçlardan hesaplansın.
- [ ] Gösterim ekibini İzzet ve dört avukatla sınırla.
- [ ] Davalar, finans ve ekip kartları dahil uygulama genelinde kullanıcıya görünen “örnek” ibarelerini kaldır.
- [ ] Finans ekranında gelir ve giderlerin dönem içindeki değişimini ve dağılımını uygun grafiklerle göster.
- [ ] Müvekkilleri “Gerçek kişi” ve “Tüzel kişi” olarak ayır. Gösterim kayıtlarına gerçekçi görünümlü kurgusal telefon (ör. 0538 ile başlayan) ve e-posta bilgileri ekle.
- [ ] Örnek aktif davaları ve görevleri ekipteki avukatlara dağıt. Her birinde iki veya üç güncel iş bulunsun. Sonuçlanmış örnek davaları da dağıt ve her avukatın kazandığı ve kaybettiği dava sayılarını ekip ekranında göster.
- [ ] Ayarlar → Gizli anahtar ekle bölümünde büro yöneticisinin AI bağlantı yöntemini seçebilmesini ve AI işlemlerinin etkin bağlantıyı kullanmasını sağla. İstenen yöntemler OpenAI API anahtarı, OpenAI hesabıyla giriş (OAuth), Claude API anahtarı ve Claude setup token. Hesap bağlantısı ve setup token için CaseBridge'de izin verilen sunucu kullanımını sağlayıcının belgelerinden doğrula. Yönetici gizli değerleri yalnız uygulamada girer. Büro bazında şifreli saklama, maskeli gösterim, adayı ayrı test etme ve açıkça etkinleştirme akışını koru.

## Geçerli çalışma ve yayın ilkeleri — 22 Kasım 2026

**Tüm CaseBridge çalışmaları GitHub Spec Kit iş akışına uymalıdır.** Bu zorunluluk mevcut açık iş listesinin tamamını, uygulamayı, tanıtım sitesini ve sunucu/yayın sürecini kapsar; yalnız gelecekte açılacak yeni işler veya entegrasyon sonrasındaki işler ile sınırlı değildir. GitHub Spec Kit 1.4.3 Codex entegrasyonu, constitution ve S02–S09 gereksinim/plan/görev/doğrulama kayıtları bu çalışma kapsamında kuruldu; tamamlanma yalnız gerçek kabul kanıtıyla işaretlenir.

**GitHub main tek uygulama ve tanıtım kodu kaynağıdır.** Her dağıtımda main’deki belirli sürüm/commit alınmalı ve canlıda çalışan kodun o sürümle eşleştiği doğrulanmalıdır. REST sunucusu/VPS üzerinde elle, yalnız sunucuya özgü uygulama kodu değişiklikleri yapılmasını önleyecek yayın düzeni planlanmalıdır. Gizli yapılandırma ve kimlik bilgileri Git’e taşınmaz; korunan yapılandırma olarak koddan ayrı tutulur. Otomatik dağıtım tetikleyicisi veya sıklığı bu kayıtla belirlenmemiştir.

## Current update — option 1

- [x] Allow a platform administrator to add a masked API key in Settings.
- [x] Test and encrypt the candidate separately; saving must not change the active key.
- [x] Require a separate Activate action, revalidate the candidate, and retain the previous key.
- [x] Verify authorization, secret redaction, failed-key handling and persistence.
- [x] Publish this update as **v.0.2**, using the `v.` display prefix.

## Mandatory before any additional customer rollout — option 2

**Customer rollout is blocked until this section is complete.** The user explicitly requires separate AI keys for each law firm before delivery or onboarding to another customer. The user subsequently authorized per-bureau key management; the staged save/test/activate workflow remains required.

- [x] Store encrypted credentials separately for each law firm, including active and pending keys.
- [x] Let each firm's administrator manage only that firm's keys; derive the firm from the authenticated session, never client-supplied IDs.
- [x] Resolve the correct firm's key throughout analysis, document intake, chat, automatic answer classification, courtroom, voice and background jobs.
- [x] Keep connection status, validation results and caches scoped to the firm.
- [x] Prevent customer requests from falling back to another firm's key or a shared application key.
- [x] Test cross-firm reads, writes, activation, cache isolation and provider requests, including queued jobs and restarts.
- [x] Preserve encryption keys and credential versions in protected backups; test recovery without exposing plaintext.
- [x] Verify successful and failed activation with synthetic data, and confirm no secret appears in responses, logs, browser storage, source control or screenshots.
- [x] Record release commit and test evidence here before marking the application ready for another customer.

## Before pushing or releasing

- [x] Review this checklist and the diff; do not include real credentials, private environment files or database dumps.
- [x] Run checks appropriate to the change and record material limits honestly.
- [x] Keep the displayed version aligned with the actual release.
- [ ] For a customer rollout, complete every mandatory option-2 item above first.

Internal development pushes may continue while the customer-release gate remains blocked. Never mark an unchecked requirement complete merely because a TODO or UI has been added.

## Validation for the current update

- Frontend suite: 709 passing tests before the staging refinement; 22 affected component tests passed after refinement.
- Backend: 52 focused provider, credential, authentication and secret-handling tests passed.
- Browser checks: platform navigation, desktop/mobile workspace checks and key entry passed; the final save-then-activate flow passed after refinement. Provider responses used synthetic test fixtures.
- Production build and type checks passed. A live user-provided key has not been entered, replaced or activated by the assistant.
- Deployed application commit `08bc3e6` to the existing app on 10 November 2026. Public health check passed; served Settings bundles contain the add-key and explicit activation controls and the `v.0.2` label. Server metadata confirms encrypted storage is enabled, with no managed or pending key yet. Previous images and protected configuration remain available for rollback.
- The full backend suite subsequently passed in GitHub CI on commit `0332187`: **994 tests passed**. Later version, permission-guidance and sidebar changes affect only frontend code and release documentation. Per-firm configuration remains incomplete and blocks additional customer rollout.

## Follow-up — v.0.3

- Clarify in the AI status panel that adding, testing and activating the shared key requires a platform administrator login; a bureau administrator cannot change the shared key.
- Keep the requested `v.0.3` release label. This clarification does not grant new permissions or implement per-firm credentials.
- Deployed to the existing app; public health and served Settings bundles confirmed the permission guidance and `v.0.3` label. All 15 affected Settings tests passed; server production compilation and type checks passed.

## Follow-up — sidebar placement

- Anchor the three-link CaseBridge AI block above the sidebar's connection status, Settings and version, keeping the main navigation at the top.
- Keep the navigation scrollable on short screens so the footer remains reachable.
- Validation: 8 sidebar component tests passed. The desktop placement check and mobile navigation check passed; the complete workspace browser tour passed on rerun with a 120-second limit after the first cold-development run reached its 60-second limit. Screenshots were reviewed at desktop and mobile sizes.
- Release version: `v.0.4`, following the already published `v.0.3` update. Deployed application commit `cf81f26`; the public Settings bundle serves the exact `v.0.4` label and bottom-anchored sidebar layout, and the health endpoint passes. Server production build/type checks and GitHub frontend CI passed for this commit. The backend source is unchanged from the 994-test successful CI run above.

## Follow-up — bureau key management, v.0.5

- User authorized bureau administrators, including the current bureau account, to add/test/activate their own encrypted OpenAI credential directly in Settings. The platform account is no longer required for bureau configuration.
- Each bureau has isolated active, pending and previous credential files, with encrypted scope binding. Bureau requests and queued jobs never use the platform fallback key. Lawyers can use the bureau connection and inspect its status; bureau administrators manage the bureau-wide key.
- Validation so far: 709 frontend tests passed, plus 46 existing credential/status/provider checks and 28 final isolation/worker/courtroom checks. All three browser scenarios passed: platform key staging/activation, bureau administrator key staging/activation and lawyer read-only access. Provider responses were synthetic. Full backend suite and deployment evidence are pending.
- Additional-customer rollout remains blocked until the unchecked requirements above have final release evidence. No real customer API key has been entered or changed by the assistant.

## Follow-up — scrolling beyond the workspace, v.0.6

- Reproduced the user's blank area by scrolling Settings to the bottom and then attempting to scroll the outer document. The first containment-only change still allowed 245 pixels of outer scrolling, so it was not sufficient.
- Fix the workspace to the viewport, contain main/sidebar scroll chaining, use a dynamic minimum viewport height for the body and keep the root background aligned with the workspace.
- The browser regression now passes at desktop and narrow-screen sizes: outer scrolling stays at zero, document height stays within the viewport, and main content reaches the bottom edge. Fifteen AppShell/sidebar component tests passed. Mobile menu follow-up and production deployment are pending.
- Bureau-key release `64b3d2e` was deployed as `v.0.5`; the public label, Settings controls, current bureau administrator permission and health were verified. The user subsequently activated their own key and supplied a screenshot showing both AI checks green. The assistant did not enter or activate that key.
- The broader workflow check found a legacy test double with the old provider signature: 56 tests passed and one test failed because the double accepted no bureau argument. The double now asserts the authenticated bureau argument, and the corrected test passes. Full-suite completion is pending.
- Deployed application commit `ac1be7f` as `v.0.6`. Public health, exact version label, fixed viewport shell, dynamic body height and scroll containment CSS were verified. Desktop/narrow-screen bottom-scroll screenshots were reviewed; the mobile menu browser check passed. Production build/type checks and GitHub frontend CI passed. Only the frontend service was recreated; the active bureau key was not changed.
- A protected archive of the encrypted credential directory and matching production environment is stored on the server for this release; archive integrity was checked. A fresh backend Python process can read the active bureau credential metadata without exposing its value. Cross-bureau ciphertext rejection and recovery into fresh storage passed in the synthetic tests.
- Full backend reruns remain in progress. Do not report all CI checks as green or mark the additional-customer release gate complete until the final full-suite result is reviewed.

## Follow-up — written and spoken courtroom dialogue, v.0.7

- The previous merged release passed the full backend CI suite: 1,003 tests on `1e46d80`, with frontend CI also successful. The separate customer-rollout gate above remains open.
- New courtroom sessions use conversation mode: the user speaks or writes as their chosen lawyer; only opposing counsel replies during the exchange. The judge produces the training decision and score only after an explicit Finish action or standalone `bitir`, `bitti`, `bit` or `done` command.
- Recording is turn based: click Konuş, speak, then Kaydı bitir. Transcription submits automatically, and new AI responses are spoken when automatic audio is enabled. This is not full-duplex or automatic silence detection. Existing structured sessions retain their original flow.
- Finishing preserves an optional final draft, does not invent another opposing statement, can retry provider failures and gives the judge the complete conversation and the presented evidence record. Role-private notes remain isolated. Audio replies use consecutive bounded segments rather than dropping the remainder of long replies.
- Validation: the final local suites passed **1,017 backend tests and 719 frontend tests**. GitHub CI also passed both jobs on `fefd946`. An existing activity-list test raced asynchronous data loading in CI; it now waits for the links, and the full suite passed after the correction.
- Browser validation passed on desktop and mobile using synthetic microphone/speech fixtures and the actual mock-provider worker. Two opposing replies appeared without any early judge decision; spoken Finish produced exactly one evaluation. The final 14 conversation-specific backend tests passed, including a 13-exchange transcript, ownership, final-draft preservation, retry and complete segmented speech. Physical microphone hardware was not tested.
- SQLite and PostgreSQL upgrade/downgrade/upgrade passed on disposable databases. A real-provider opposing reply and final judge evaluation passed in isolated memory storage without writing production records. A short real Turkish speech-generation/transcription round trip passed using the existing bureau credential; its value and activation were unchanged.
- Application source `c8a6c78` was deployed as **v.0.7**. Server production compilation/type checks passed. The public site serves the expected version, updated courtroom controls and Finish API; health returns HTTP 200. The production schema reached the expected migration, and the existing bureau credential remains readable after restart.
- Database dumps, encrypted credential archives and matching configuration are protected on the server under the courtroom release backup; archive integrity was checked and previous application images were retained. Only the two application services were recreated.
- A follow-up after the user's connection interruption confirmed public page/API HTTP 200, successful live AI response, zero container restarts and no backend HTTP 5xx or tracebacks in the preceding 20 minutes. This does not identify the cause of the user's temporary connection interruption.

## Follow-up — Sufle interview pilot, v.0.9

- Add Sufle to the bureau sidebar and AI hub; publish the twenty fictional example interviews as HTML and downloadable text.
- Add GPT-backed interview assistance using only the authenticated bureau's existing active key. Key staging, activation and retention are unchanged. The separate local v.0.8 design-preview work is preserved outside this isolated release.
- Continuous microphone capture uses approximately ten-second independent audio clips; this is near-live processing, not full-duplex Realtime or automatic speaker diarization. Text-only synthetic testing is available. Finish drains final audio before creating a summary. Failed clips stay in page memory for retry; page navigation loses the non-persisted interview, which can be exported explicitly.
- Source-linked cards use exact quotations. Wrong source IDs are corrected only with a unique exact quote; unsupported cards never appear. Rate/size/history limits and provider errors are enforced. Sufle API usage is charged to the bureau and shown per session; it is not included in the existing persisted analysis/chat monthly usage counter.
- Validation so far: the full frontend suite passed 727 tests; 22 final affected component checks and 28 final Sufle API tests passed, along with 19 credential-management checks. Both browser scenarios passed, covering desktop/mobile text flows, example counts, downloads, card actions, automatic continuous capture, failed-audio retention/retry and draining the last clip before the summary. A real GPT response and summary plus a Turkish speech round trip passed against synthetic data using the existing bureau credential without changing it. Physical microphone hardware was not tested. Production compilation/type checks passed locally and on the server. The broader backend run was interrupted and reported a temporary-directory fixture error during interruption cleanup; no complete full-suite result or new GitHub CI result is claimed.
- The mandatory additional-customer rollout requirements above remain unchecked. This pilot is for the existing installation, not authorization to onboard another bureau.

- Deployed application source `9921f0e` as **v.0.9** to the existing installation. The public Sufle page serves the new controls and exact version label; Sidebar marks Sufle active. Both example files return HTTP 200 and contain 1,002 dialogue turns / 120 cards. Desktop and 390px mobile checks passed without overflow or browser page errors.
- Public authenticated API checks passed with synthetic input: anonymous status is rejected (401), bureau status succeeds, real WAV transcription succeeds, GPT produces source-grounded advice, and Finish produces a summary. An additional check used Chromium's native AudioContext and MediaRecorder to create an actual WebM clip; the same public API recognized its synthetic Turkish speech successfully. No physical microphone was used.
- Public health passed (HTTP 200). The backend had zero restarts, zero HTTP 5xx and zero tracebacks in the reviewed five-minute window. Existing encrypted credential files and protected configuration match the pre-release backup byte-for-byte. No key was entered, replaced or activated.
- Protected pre-release backup: `/var/backups/casebridge/sufle-v0.9-20261110T165458Z`, including database dump, storage archive and matching configuration. Checksums, archive readability and dump listing passed; this release did not perform a new full recovery drill. Previous application images are retained under `before-sufle-v09` tags. Only the two Casebridge application services were recreated; the database schema and shared Autosense stack were unchanged.

## Bureau and platform management — local development, 11 November 2026, v.0.9

- Added the bureau administrator's `/buro` operations workspace: real case/task/calendar alerts and capacity, critical deadlines with primary/backup responsibility and verification, financial/time records, client/contact tracking, new-business stages and same-bureau party search, review/approval versions, dependent checklists, leave records, client publications, scoped invitations/access, AI usage/budget assumptions, support, append-only management history and reversible management-record trash.
- Added `/platform` search/status/invitation filters and summary counts; `/platform/[id]` provides contact/billing details, onboarding steps, manual subscription/payment tracking, enforced invitation/reactivation and document-storage limits, account ownership/follow-up, operational counts, support and platform-only history. Last-seen tracking starts with this update; no historical activity is invented. Platform profile/history do not expose customer case text, financial records or private management notes.
- Added `/calisma-alanim` for assigned work and restricted staff/client accounts. Scoped accounts are blocked at the shared authentication dependency from legacy case/search/report/AI/admin APIs. Client visibility requires an explicit published audience grant; documents are selected separately and downloads recheck the current publication and case grant. New scoped users receive the grant before their invitation is usable. Administrators cannot turn a user with open work into a client without transferring the work first.
- Extended work transfer and the existing deactivation workflow to include open management work. Added a recipient's delivery acknowledgement and the manager's receipt view. Financial records use Decimal and separate fee/payment, expense/reimbursement, advance/spend and currencies; case value is not revenue. AI cost is an explicitly user-entered estimate over recorded analysis/chat tokens, with incomplete voice/intake/courtroom coverage; its budget is an alert threshold, not a provider spending cap. Role presets are described in `docs/bureau-management.md`; this is not an unrestricted custom permission designer or payment/accounting integration.
- Migration `d8e9f0a1b2c3` adds the five management tables and last-seen metadata. A disposable SQLite upgrade/downgrade/upgrade and durable reopening test passed. PostgreSQL offline migration SQL generation passed; a live PostgreSQL migration has not been run for this change.
- Full backend suite: **1,041 passed** in an isolated test process using real bcrypt with cost 4 for synthetic fixtures only. The initial normal-cost full-suite run was interrupted because fixture hashing dominated runtime; it was not reported as a completed run. No production source/default was weakened. A fresh process separately verified the unchanged default bcrypt cost **12**, successful verification and rejection of an incorrect password. **51 focused bureau/platform/user-lifecycle tests passed at normal cost**, followed by a normal-cost portal test that verified actual shared-file download, no-store headers and immediate rejection after access revocation.
- Frontend: **725 tests passed**. After the form-label and lifecycle refinements, **38 affected component tests passed**; the final checklist cascade checks passed in the **5-test** workflow component suite. Type checking and the final production build passed. Existing dependency deprecation, jsdom navigation and chart-size test warnings were observed; they did not fail the suites.
- Browser: **3 Chromium scenarios passed** against a disposable local database and mock AI provider: existing firm creation/admin login/suspension, bureau fee/deadline/review/portal flow and mobile navigation, platform profile/support persistence. The first bureau run exposed an implicit-select-label lookup problem; explicit input-label associations fixed it and the rerun passed. Desktop/mobile screenshots were inspected; the dark summary card contrast and mobile section chooser were refined. Synthetic client publications remained private until published; internal review text did not appear in the client portal. Public production was not modified.
- Unreleased application manifest is **v.0.9**, following the local v.0.8 preview. Repeated development test-server version bumps were consolidated into this single proposed version; the manifest retains the final application source hash. Marketing files and their independent version were not changed by this work.
- [x] Published the combined application as v.0.10 with protected backups, the production migration and retained rollback images; see final evidence below.
- [x] Verified the superseding public v.0.10 label, updated application code and health; v.0.9 was already occupied by the Sufle release.
- No Git commit, push, production deployment, real customer onboarding or AI credential change occurred. The mandatory additional-customer release gate above remains unchanged and incomplete; this development is not approved for another customer rollout.

## Bureau management production preparation — 11 November 2026, v.0.10

- Release is based on the deployed Sufle source `9921f0e` and its verified release record `93baa28`, preserving Sufle routes, views, configuration and tests. The independent local five-design preview and marketing changes are excluded. Live already uses v.0.9; the combined release is v.0.10.
- Merged-source validation: 1,069 backend tests passed in the isolated synthetic-fixture bcrypt-cost-4 process; 733 frontend tests and TypeScript passed. The default production bcrypt-cost-12 checks and normal-cost management checks from the preceding development record remain applicable; production password settings are unchanged.
- No live credential is to be entered, rotated or activated by this deployment. Existing encrypted credential versions and matching encryption configuration must be preserved in protected backups and recovered in isolation without revealing their values.
- Production backup, live PostgreSQL migration rehearsal, browser release checks, public version/code/health and post-restart credential metadata checks are pending. The customer-rollout gate remains incomplete until its evidence is recorded.

### Verified preflight — application source `4dfbf27`

- All **1,069 backend** and **733 frontend** tests passed on the combined bureau-management/Sufle source. **7 Chromium release scenarios passed**, including both platform/bureau key staging and explicit activation, lawyer read-only key status, management/client portal and Sufle desktop/mobile/audio retry flows. Synthetic-provider fixtures were used for key activation and AI browser calls.
- Tenant credential evidence includes `test_firm_ai_keys.py`, `test_ai_key_settings.py`, queued-job provider selection, firm cache isolation, ciphertext scope binding, failed activation retention, synthetic protected recovery and fresh-process resolution. No real key was entered, changed, returned, logged or placed in browser storage.
- Protected preflight backup: `/var/backups/casebridge-bureau-v010-preflight/` on the server, restricted to root. It contains the database dump, document/storage archive, encrypted active/pending/previous credential files, matching production encryption configuration and previous commit/image records. Dump/archive readability and checksums were checked. The backup was restored to a network-isolated PostgreSQL 16 container and separate protected storage.
- Real backup recovery preserved **7 firms, 8 users, 40 cases and 98 documents**. **Two stored encrypted credential versions** were decrypted only in isolated process memory with the backed-up configuration; no plaintext was written or printed. PostgreSQL upgrade → downgrade → upgrade reached `d8e9f0a1b2c3` and the five expected management tables. The initial probe encountered the temporary PostgreSQL initialization socket restarting; waiting for TCP readiness and rerunning the restore completed successfully. Production remained available during the probe.
- These results complete the four outstanding technical option-2 checklist items above. This deployment does not create or onboard a new customer. Public deployment verification is still pending below and must pass before calling this release complete.

## Verified bureau management production deployment — 11 November 2026, v.0.10

- Deployed application source `4dfbf27` with preflight evidence `121726e` to the existing installation. Sufle is preserved. The earlier local-only notes describe the development stage and are superseded by this deployment record. Independent marketing and design-preview changes were excluded.
- Protected coherent final backup: `/var/backups/casebridge-bureau-v010-final/`, including database, storage, matching configuration, prior source/images and rollback configuration. Only the CaseBridge backend/frontend services were stopped and recreated. PostgreSQL and the shared Autosense stack remained running.
- Production migration reached `d8e9f0a1b2c3`; all five management tables exist. Counts remained **7 firms, 8 users, 40 cases and 98 documents**. Matching production configuration and encrypted credential files remain byte-identical to the final backup. A fresh backend process read both encrypted credential versions in memory without exposing their values. No key was entered, replaced or activated.
- Public HTTPS checks passed for `/buro`, `/calisma-alanim`, `/platform` and `/ai/sufle`, including their updated UI code. The public application serves **v.0.10**. **13 publicly served compiled files match the running frontend image byte-for-byte**; the release manifest matches source hash `a894ffe26251e2f7c097a0fd9a4896b8c383fd3fd93ab120efe78261e035b2ae`. Sufle examples remain available. Public `/api/health` returns HTTP 200 and `status: ok`; backend is healthy and both application containers had zero restarts at verification.
- Combined-source validation remains **1,069 backend tests, 733 frontend tests, TypeScript and 7 Chromium scenarios passed**, plus the successful isolated PostgreSQL upgrade/downgrade/upgrade and encrypted recovery drill above. No physical microphone check or new customer onboarding is claimed.
- Previous application images remain tagged `before-management-v010`. Rollback retains the additive schema and starts the prior backend directly rather than asking its older Alembic code to resolve the new revision. Release evidence and public chunk checks are protected beside the final backup.

## Platform list simplification — 11 November 2026, v.0.11

- Replace the large rounded panel and four summary cards with a direct page layout and clickable inline status counts. Add a neutral platform-only canvas, narrower white sidebar, smaller controls and the platform navigation label Bürolar. Other bureau workspaces retain their existing shell.
- Bureau names link directly to their profiles. Native keyboard-accessible row disclosures expose profile, administrator/invitation and status actions; suspension/reactivation still requires the existing reason dialog. Show administrator invitation/access state explicitly; this is not a complete onboarding indicator or historical last-activity estimate.
- Validation: **733 frontend tests**, TypeScript and **2 Chromium scenarios passed**, covering creation/invitation/suspension plus summary filtering, search, row actions/Escape, profile persistence and support. Desktop 1280px and mobile 390px screenshots were inspected; the mobile table scrolls within its container without document overflow. Existing mock-navigation/chart-size and dev-server warnings did not fail checks. Backend code, schema and credential flows are unchanged.
- Production build and frontend-only deployment are complete; public version/code/health evidence follows. No new customer onboarding is included.

### Verified platform publication — v.0.11

- Published source `587e49f` to the existing installation. Server production build/type checks passed. Only the frontend was recreated; the backend container ID and running database were unchanged. No credential configuration, API key, schema or customer onboarding was changed.
- Public `/platform` serves v.0.11, the new neutral/narrow shell, inline summary, access-state column and row actions. All **10 public JavaScript files match the running frontend image byte-for-byte**. Public HTTPS health passes with `status: ok`. The startup readiness loop observed one transient HTTP 502 during frontend replacement, then succeeded; final page, asset and health checks passed.
- Rollback frontend image retained as `cb-prod-cb-frontend:before-platform-v011`; prior source/image IDs, build output and public verification evidence are recorded in `/var/backups/casebridge-platform-v011/`. The existing protected v.0.10 database/configuration/storage backups remain available.

## Restore the previous platform design — 11 November 2026, v.0.12

- User requested reversal of the v.0.11 visual redesign. Restored the four summary cards, rounded panel, blue platform shell, original sidebar width/label, firm detail buttons and separate profile links from v.0.10. Source files and existing tests are restored exactly; no bureau-management features are removed.
- The application source hash returns exactly to the verified v.0.10 hash `a894ffe26251e2f7c097a0fd9a4896b8c383fd3fd93ab120efe78261e035b2ae`. The release label advances to v.0.12 to record this subsequent release. 33 affected component tests passed. The earlier v.0.10 full-suite/browser verification applies to the identical restored application source; no fresh full-suite result is claimed.
- Production build and public version/code/health verification completed; final evidence follows. Frontend-only release; no schema, credentials or customer onboarding changes.

### Verified restoration — v.0.12

- Published source `609a81d`, restoring the verified v.0.10 platform design. 33 affected frontend tests, TypeScript and server production build/type checks passed. Public HTTPS `/platform` serves v.0.12 and the prior panel, four summary cards, original shell and profile links. All 10 public JavaScript files match the running frontend image byte-for-byte; health returns `status: ok`.
- Only the frontend container was recreated; backend container identity is unchanged. No database, credential or onboarding changes. One transient startup HTTP 502 was followed by successful readiness and final public checks. Previous image, source IDs, build logs and verification evidence are retained at `/var/backups/casebridge-platform-v012/`; rollback image tag is `before-platform-v012`.

## Gösterim veri kapsamı — v.0.16 yayın hazırlığı

- Canlı v.0.12 tabanından ayrı `codex/demo-presentation-release` dalı hazırlandı. Sufle, mevcut tasarım ve platform v.0.12 düzeni korundu. Ana çalışma dizinindeki bağımsız tasarım, tanıtım ve büro silme değişiklikleri bu yayına alınmadı.
- Örnek yükleyici tüm büro kayıt türlerini, aktif destek örneklerini, üç kurgusal emsal incelemesini, arşivi, indirilebilir belgeleri, analiz/sohbet/kişisel prova geçmişini tamamlar. Var olan kaydı olan bürolar da eksik modülleri tek düğmeyle tamamlayabilir.
- Aynı büroda kararlı kimliklerle tekrar yükleme çoğaltmaz. Örnek kişiler yalnızca kurgusal dava erişimi alır; bilinen ortak şifre, davet tokenı veya otomatik e-posta oluşturulmaz. Örnek görev/etkinlik/kritik süre e-posta hatırlatmaları kapalı, örnek izin talep aşamasındadır. Mevcut gerçek kayıtlar ve büro anahtarları korunur.
- 52 ilgili backend testi, 38 Settings/Chat/Sufle testi ve üretim derlemesi/TypeScript geçti. E-posta yan etkisi kontrolleriyle son şablonun 6 testi tekrar geçti.
- Bu yayın yeni müşteri teslimi değildir; mevcut deneme2 bürosunda kullanıcının gösterim talebini karşılar. Zorunlu ek müşteri sürüm kapıları değiştirilmez.
- [ ] Korumalı yedek ve PostgreSQL üzerinde şablon doğrulaması.
- [ ] Mevcut kurulumda v.0.16 yayın, kamuya açık sürüm/kod/health doğrulaması ve hedef büroda gösterim verilerinin doğrulanması.

- İzole üretim PostgreSQL kopyası, eski şablondaki boş `next_hearing_date` alanının `_seed_case_detail` içinde biçimlendirme hatasına yol açtığını ortaya çıkardı. Eksik tarihleri/alanları not üretiminden önce tamamlama sırası düzeltildi; eski tek dava şablonu için regresyon testi eklendi. Üretim servisleri bu hata sırasında değiştirilmedi.

## Application appearance preference — v.0.17, 12 November 2026

- Added dark-by-default application styling and Settings > Görünüm > Koyu / Açık for all roles, including the platform administrator. The preference is local to the current browser and survives navigation, reload and logout; other tabs synchronize. Invalid/missing preferences fall back to dark. Storage failures do not prevent switching during the current session.
- A small pre-body initialization script restores the saved theme before the page paints. Native form color schemes, semantic status colors, charts, AI content, translucent surfaces and the logo have dark treatments; light mode preserves the existing application palette. Appearance does not change bureau permissions or credential management.
- Built on the clean live `92a44a1` application baseline in the isolated `codex/dark-theme` checkout. Independent unpublished development and marketing changes are excluded from the release.
- Actual validation: 739 frontend tests passed (including four new preference/Settings/storage tests); production build and TypeScript passed. Synthetic local browser checks at 1440/390px passed for default dark, Settings selection, persistence/reload/navigation, cross-tab synchronization, dashboard/cases/analysis/calendar/reports/chat/hearing and unauthenticated login. Desktop/mobile dark/light Settings and representative route screenshots reviewed. Backend tests were not rerun for this frontend-only change.
- [ ] Deploy the frontend and verify the public v.0.17 label, current Settings/theme bundles, dark/light browser behavior and health. A completed local build is not deployment evidence.
- Existing mandatory additional-customer release requirements remain unchecked. No new customer rollout is authorized by this theme update.

## Tanıtım sitesi — özgün video ve Emin yenilikleri, v.0.42 (22 Kasım 2026)

- Kullanıcı özgün arka plan videosunun mevcut tema korunarak geri getirilmesini, Emin’in mevcut yeniliklerinin tanıtılmasını ve aynı site değişikliklerinin VPS ile GitHub main’e alınmasını istedi. Önceki canlı v.0.41’in Türkçe metinleri, logo mavisi/beyaz teması, sol hizalama, ekip paragraf düzeni ve yatırım/beş yıllık plan/küresel hedef kaldırmaları korunarak kaynak kontrolüne alındı.
- Özgün video ve poster mevcut public dosyalarla SHA-256 düzeyinde aynı. Sessiz/döngülü/satır içi oynatma, cover ve mobil konum, hareket azaltma ve ekran dışında durdurma davranışları korundu. Ek CSS yalnız okunabilir beyaz hero katmanını açıyor; genel tema kurallarını değiştirmiyor.
- Emin’in ad047d2 commit’i ve main 5e79e0d kaynaklarından üç mevcut özellik doğrulandı: Bilgi Haritası (tanıtımda Hukuki zihin haritası), Karşı Taraf Analizi ve Yönetilen Duruşma. Ürün bölümüne üç Türkçe açıklama ve mevcut v.0.18 uygulamasının yalıtılmış açık tema önizlemesinden doğrudan ekran görüntüleri eklendi. Gerçek müşteri verisi/anahtarı veya dış sağlayıcı çağrısı yok; kurgusal özet ve mevcut örnek yanıtlar kullanıldı. Örnek mod etiketleri, harita kaynağı ve betimleyici istatistik açıklaması korundu. Görünen İngilizce açıklamalar yalnız yalıtılmış önizleme kaynağında yerelleştirildi; görüntülere sonradan yazı eklenmedi. Ayrıntılar: web-page/assets/feature-screens/tr-current/CAPTURE_NOTES.md.
- [x] Temiz origin/main çalışma alanında statik site Chromium kontrolleri 1440/1280/768/390/320px: Türkçe içerik, mevcut tema, 11 sekme ve 11 görsel büyütme, klavye/odak iadesi, mobil menü, açılmış ürün/SSS içeriği, taşma ve tarayıcı/varlık hataları. JavaScript kapalı temel içerik ve ürün açıklaması da geçti.
- [x] 1440/768/390/320px video kontrolleri: currentTime gerçekten ilerliyor, video boyutları mevcut, muted/loop/playsinline/metadata/cover ve özgün konum doğru; ekran dışı durdurma/geri gelince devam ve hareket azaltma tercihi geçti. Masaüstü/mobil video ve üç yeni uygulama görüntüsü görsel olarak incelendi. Yakalama metinlerinde kalan İngilizce denetimi ve JavaScript sözdizimi/whitespace kontrolleri geçti.
- İlk sekme kontrolünde video nedeniyle networkidle beklemesi zaman aşımına uğradı; DOM hazır olma ve somut UI kontrolleri kullanıldı. Büyütme penceresi kapanırken odak iadesi kuyruğu testte beklendi; son klavye kontrolü geçti. Uygulama/backend tam test paketleri statik tanıtım değişikliği için çalıştırılmadı.
- [x] VPS yayın sonrası HTML/manifest v.0.42, özgün video/poster dahil 47 kamuya açık dosyanın main 52a7bdc kaynaklarıyla birebir SHA-256 eşleşmesi doğrulandı. Kamuya açık sitede video 1440/768/390/320px boyutlarında gerçekten ilerliyor; sessiz/döngülü/satır içi oynatma, durdurma/devam ve hareket azaltma kontrolleri geçti. Beş genişlikte 11 sekme/büyütme, mobil menü/klavye, JavaScript kapalı içerik ve taşma/tarayıcı/varlık hatası kontrolleri geçti. https://app.casebridge.com.tr/api/health HTTP 200 ve status: ok döndü.
- [x] Kaynak commit 52a7bdc0b6689ec4518b500caa6549f8040dbb93 GitHub main’e force kullanmadan gönderildi ve uzak ref doğrulandı. Yayımlanan 21 tanıtım dosyası bu commit ile aynı; diğer yüklenen bağımlılıklar ve özgün video da main kaynaklarıyla aynı. Yayın öncesi mevcut 16 dosya /var/backups/casebridge-marketing-20261122-v042/previous-files.tar.gz altında yedeklendi ve her arşiv girdisi okunarak doğrulandı; yeni 5 dosya ayrıca listelendi. Ana sayfa son sırada atomik değiştirildi; uygulama servisleri yeniden başlatılmadı.

Uygulama servisi veya gerçek kimlik bilgileri değiştirilmez; müşteri onboarding yapılmaz. Mevcut müşteri release gereksinimleri olduğu gibi korunur. Yerel bağımsız çalışmaların üzerine yazılmaz; commit/push temiz ayrı çalışma alanından yapılır. Ayrıntılı kanıtlar yerel artifacts/marketing-v042/ altındadır.

## Daha görünür arka plan videosu — v.0.43, 22 Kasım 2026

- Kullanıcının dar takip isteğiyle yalnız beyaz video katmanının opaklığı azaltıldı: masaüstünde soldan sağa yaklaşık %96/%90/%40/%20 yerine %88/%78/%28/%12; mobilde yaklaşık %85 yerine %78. Özgün video, tema, yazı renkleri, yerleşim ve tüm içerikler korundu. HTML gövdesinin önceki sürümle aynı olduğu, yalnız sürüm/CSS cache anahtarının değiştiği doğrulandı.
- Yerel Chromium kontrolleri 1440/768/390/320px genişliklerde geçti: v.0.43, gerçek video zamanının ilerlemesi, özgün muted/loop/playsinline/metadata/cover/konum, ekran dışında durdurma/geri gelince devam, hareket azaltma, mevcut beyaz/mavi tema ve sol hizalama, taşma ve tarayıcı hataları. Masaüstü ve mobil ekran görüntülerinde videonun daha görünür olduğu ve yazıların okunabilirliği görsel olarak kontrol edildi; bu tam bir erişilebilirlik denetimi değildir. Whitespace kontrolü geçti. Uygulama/backend paketleri bu CSS değişikliği için çalıştırılmadı.
- [x] Public HTML/manifest v.0.43 ve azaltılmış overlay opaklığı doğrulandı. Canlı video 1440/768/390/320px boyutlarında gerçekten oynuyor; özgün ayarlar, ekran dışı durdurma/devam, hareket azaltma, mevcut tema, taşma ve tarayıcı hatası kontrolleri geçti. Health HTTP 200 / status: ok.
- [x] Kaynak commit d3f2e13446ea0b492d5572549b9c7253946154a8 GitHub main’e force olmadan gönderildi. Canlıdaki 47 kaynak/varlık dosyası (özgün video ve poster dahil) main kaynaklarıyla SHA-256 düzeyinde aynı. Yalnız index.html, hero-video-restoration.css ve website-version.json yayımlandı; önceki üç dosya /var/backups/casebridge-marketing-20261122-v043/previous-files.tar.gz altında yedeklendi ve arşivde her dosya okunarak doğrulandı. Ana sayfa son sırada atomik değiştirildi; uygulama servisi yeniden başlatılmadı.

Önceki uygulama/kimlik bilgisi ve müşteri release gereksinimleri değişmedi; yeni müşteri onboarding yapılmadı. Kanıtlar yerel artifacts/marketing-v043/ altında tutulur.

## CaseBridge AI grup çerçevesi — uygulama v.0.19, 22 Kasım 2026

- Kullanıcının istediği dar uygulama UI düzeltmesi: /ai altındaki rotalarda Sidebar grubuna koşullu eklenen `ring-2 ring-accent-400` kaldırıldı. Bu bir focus göstergesi değildi; rota vurgusuydu. Grubun temel kenarlığı/teması, seçili alt bağlantı arka planı ve bağlantıların `focus-visible` halkaları aynı kaldı. Genel focus kuralları değiştirilmedi. Kullanılmayan inAi değişkeni kaldırıldı.
- Mevcut 9 Sidebar testi geçti. Yalıtılmış mevcut uygulama ve yalnız sentetik demo API/verileriyle Chromium kontrolleri 1440/390px, koyu/açık temada geçti: Raporlar’dan Dosya Analizi’ne fareyle geçişte grup box-shadow/outline/border/background değişmiyor; grup ring sınıfı yok, seçili link ve aria-current korunuyor. Shift+Tab/Tab ile linke klavye odağı görünür; grubun dış halkası oluşmuyor. Mobil menü, v.0.19 etiketi, taşma ve tarayıcı hataları kontrol edildi; ekran görüntüleri incelendi. İlk testlerde menü düğmesi seçicisi ve yerel demo giriş hız limiti düzenlendi; uygulama davranışı bu test düzenlemeleriyle değiştirilmedi. Whitespace kontrolü geçti.
- [x] Sunucu ön yüz üretim derlemesi ve tip kontrolü geçti. Kaynak b640c54a4c180df0d46ee3d210541f1238039d60, uygulama v.0.19 olarak yalnız cb-frontend servisine yayımlandı. Önceki frontend imajı cb-prod-cb-frontend:before-ai-outline-v019 etiketiyle tutuluyor; önceki kaynak/manifest/container kimlikleri ve build/deploy logları /var/backups/casebridge-ai-outline-v019-20261122/ altında.
- [x] Kamuya açık arayüzde mevcut üretim JS/CSS kodu ve sentetik yerel demo API/verileriyle 1440/390px, koyu/açık temada aynı fare/klavye/aktif link/menü/sürüm kontrolleri geçti. Görünür sürüm v.0.19. Gerçek müşteri oturumu, verisi veya sağlayıcı çağrısı kullanılmadı. Yüklenen 31 public JS/CSS dosyası çalışan frontend imajındaki dosyalarla birebir SHA-256 eşleşiyor. Public /ai/analiz ve /api/health ilk readiness denemesinde HTTP 200 verdi; son health kontrolü de HTTP 200 / status: ok.
- [x] Kaynak b640c54 GitHub main’e force olmadan gönderildi; sunucu temiz checkout’u bu commit ile eşleşiyor ve uygulama manifesti aynı kaynak hash’iyle 0.19. Backend ve veritabanı container ID, image ID ve başlangıç zamanları önceki kayıtla birebir aynı. Public tanıtım sürümü v.0.43 olarak kaldı; tanıtım yayını yapılmadı.

Tanıtım sitesi v.0.43 olarak kalır. Backend, şema, sağlayıcı/gerçek kimlik bilgileri ve onboarding kapsam dışıdır. Yerel bağımsız çalışmalar korunur; commit/push temiz ayrı çalışma alanından yapılır. Kanıtlar yerel artifacts/app-v019/ altındadır.

## Yeni planlanan işler — kullanıcı talepleri, 22 Kasım 2026

Bu bölüm kullanıcı kapsamını ve kabul şartlarını korur. Aşağıdaki işlerin güncel uygulama/test/yayın durumu son doğrulama kaydındadır; önceki tamamlanmış yayınlar ve zorunlu müşteri-release kapıları değiştirilmez.

### Geliştirme iş akışı

- [x] **GitHub Spec Kit:** Projeye GitHub Spec Kit entegrasyonunu planla ve gerçekleştir. Mevcut açık işler dahil tüm CaseBridge çalışmalarını (uygulama, tanıtım sitesi ve sunucu/yayın süreci) GitHub Spec Kit iş akışına göre düzenle. Kullanıcının kesinleştirdiği proje GitHub Spec Kit’tir; bu kayıt entegrasyonun yapıldığı anlamına gelmez.
- [x] **Main kaynaklı yayın düzeni:** REST sunucusu/VPS üzerinde elle, sunucuya özgü uygulama kodu değişikliklerini önleyecek bir yayın düzeni planla. GitHub main tek kod kaynağı olsun; her dağıtımda main’deki belirli sürüm/commit alınsın ve canlı kodun bu sürümle eşleştiği doğrulansın. Bu süreci de GitHub Spec Kit’e göre düzenle. Gizli yapılandırmayı Git’e taşıma; otomatik dağıtım tetikleyicisi veya sıklığı belirlenmiş varsayma.

### Uygulama

- [x] **Yapay zekâ erişimlerini header’a taşı:** Uygulamadaki yapay zekâ menü/erişimlerini sidebar’dan header’a taşı. Kullanıcının açık tercihi header’dır; sidebar’a yeniden yerleştirme.
- [x] **Bilgi Haritası uyumu:** Emin’in güncel Bilgi Haritası kaynağını mevcut uygulamadaki Bilgi Haritası ile karşılaştır. Kullanıcının bildirdiği görünüm farkını doğrula, nedenini belirle ve mevcut uygulamayı güncel kaynakla uyumlu hale getir.
- [x] **Olasılık Haritası / olasılık ağacı:** Bilgi Haritası’na ek olarak, davadaki mevcut olay ve bulgulardan olası sonraki gelişmelere, alternatif senaryolara ve bunların olasılık değerlendirmelerine dallanan benzer bir görsel yapı planla. Önce Emin’in güncel çalışmasında bu özelliğin zaten bulunup bulunmadığını kontrol et; varsa yeniden üretmek yerine mevcut yapıyı değerlendir. Olasılık değerlendirmelerinin gerekçelerini ve belirsizliklerini göster; gerçekte hesaplanmamış yüzdeleri doğrulanmış veri gibi sunma.
- [x] **Açık/koyu temada logo tutarlılığı:** Koyu temaya geçildiğinde CaseBridge logosunun değişmesi sorununu incele ve tema geçişleri arasında tutarlı logo kullanımını sağla.

### Tanıtım sitesi

- [x] **Güncel gerçek ürün görselleri:** Tanıtım sitesindeki ürün görsellerini güncel gerçek uygulama ekranlarıyla karşılaştır; uyumsuz olanları güncelle. Gerçek uygulama ekranlarını kullan, gerçek kullanıcı verilerini ifşa etme; gerekli gösterimleri kurgusal/sentetik verilerle hazırla.
- [x] **Videoyu daha da görünür yap:** Arka plan videosu üzerindeki beyaz katmanın şeffaflığını yeniden artır. Bu, tamamlanmış v.0.43 ayarından ayrı, daha fazla video görünürlüğü isteyen yeni taleptir. Mevcut video ve temayı koru; masaüstü/mobil yazı okunabilirliğini kontrol et.
- [x] **Sık Sorulan Sorular:** Tanıtım sitesinin Sık Sorulan Sorular bölümünü genişlet. Bu madde kullanıcının son eklemesidir.


### Ayrıntılı uygulama planı ve kabul ölçütleri

**Durum:** Aşağıdaki bölüm bir uygulama planıdır. Dokuz açık işin hiçbiri bu belge güncellemesiyle tamamlanmış sayılmaz. Spec Kit kurulumu, özellik geliştirme, sunucu ayarı, sürüm artırımı, commit/push veya dağıtım bu görevde yapılmadı. Yukarıdaki geçmiş doğrulamalar, bu yeni işlerin kabul kanıtı olarak kullanılamaz.

#### Dayanaklar ve doğrulanmamış noktalar

22 Kasım 2026’da incelenen yayımlanmış kaynak kopyası `fdf7333` uygulama `v.0.19`, tanıtım `v.0.43` temelindedir; bağımsız yerel çalışma ağacında yayımlanmamış değişiklikler vardır. Uygulamaya geçerken main, canlı sürüm ve yerel farklar yeniden kaydedilecek; mevcut çalışma silinmeyecek veya körlemesine üzerine yazılmayacak.

- **Doğrulanmış kod:** `frontend/src/components/Sidebar.tsx` içindeki `AI_ITEMS`, Sufle, Dosya Analizi, Canlı Duruşma, Hukuk Asistanı, Karşı Taraf Analizi, Yönetilen Duruşma ve Bilgi Haritası bağlantılarını taşır. Hub bağlantısı `/ai`’dır. Sidebar ayrıca `platform` ve `restricted` durumlarını ayırır. `WorkspaceHeader.tsx` mevcut header bileşenidir.
- **Doğrulanmış kod:** `/ai/harita`, `components/lab/MapView.tsx` bileşenini kullanır. `backend/app/api/routes/legal_lab.py` içindeki `/legal-lab/map`, `backend/app/legal_lab/graph.py` üzerinden statik `legal_graph.json` verisini döndürür. Kaynak açıklaması bu istatistiklerin betimleyici olduğunu, dava sonucu tahmini olmadığını belirtir. Bu veri bir davaya özgü olasılık ağacı olarak kabul edilemez.
- **Doğrulanmış kod:** `BrandLogo.tsx` `/casebridge-logo.png` kullanır; `frontend/src/app/theme.css` koyu temada bu görseli `content:url('/casebridge-logo-dark.svg')` ile değiştirir. Tema tercihi `lib/theme.ts` içindeki `casebridge-theme` anahtarıyla tutulur. Logo farkının kapsamı görsel karşılaştırmayla ayrıca doğrulanacak.
- **Doğrulanmış kod:** Tanıtım ürün alanında 11 sekme vardır. `assets/feature-screens/tr-current/CAPTURE_NOTES.md`, eski ekranlar için uygulama v.0.17, son üç ekran için v.0.18 önizleme kaynağını kaydeder; güncel ürünle eşitlik henüz yeni iş kapsamında doğrulanmış değildir. `hero-video-restoration.css` v.0.43’te beyaz video katmanını tanımlar. `index.html` içindeki SSS’de dört soru bulunur.
- **Doğrulanmış kod:** `deployment/publish.sh` sunucudaki checkout’tan build yapar ve backend/frontend servislerini birlikte hedefler. Bu betiğin varlığı, sunucuda elle kod değişikliğini teknik olarak önlediği veya aşağıdaki yeni yayın düzeninin kurulu olduğu anlamına gelmez.
- **Henüz doğrulanmadı:** Emin’in şu anki en güncel kaynak/branch/commit’i, kullanıcı tarafından görülen harita farkının nedeni ve bir Olasılık Haritası’nın zaten geliştirilmiş olup olmadığı. Bunlar S04/S05’in inceleme çıktılarıdır. Sunucudaki hesapların yazma/Docker yetkileri ve yeni dağıtım düzeninin teknik uygulanabilirliği S02’de ayrıca incelenecek.

#### Sıra ve bağımlılıklar

| Kimlik | Açık iş | Bağımlılık ve yürütme sırası |
| --- | --- | --- |
| S01 | GitHub Spec Kit entegrasyonu ve ortak çalışma kuralları | İlk iş; diğer sekiz işin gereksinim/plan/görev kayıtları buna bağlanır. |
| S02 | Main kaynaklı, sunucuda elle kod değişikliğini önleyen yayın düzeni | S01’den sonra; sonraki canlı yayınlar bu düzenin kabulünden sonra yapılır. |
| S03 | Yapay zekâ erişimlerini header’a taşıma | S01’den sonra; izin ve gezinme davranışları önce belirlenir. Yayın S02’ye bağlıdır. |
| S04 | Emin’in Bilgi Haritası ile uyum | S01’den sonra; ortak örnek ve kaynak karşılaştırması, değişiklikten önce tamamlanır. |
| S05 | Olasılık Haritası / olasılık ağacı | S01 ve S04’ün kaynak/veri ayrımı çıktısından sonra; önce Emin’de mevcut iş aranır. |
| S06 | Tema geçişlerinde logo tutarlılığı | S01’den sonra; görsel kimlik kararından sonra S03 ile birlikte görünüm kontrolü yapılır. |
| S07 | Güncel gerçek ürün ekran görüntüleri | S03/S04/S06’nın kabul edilmiş hedef görünümünden sonra; S05’ten yalnız gerçekten mevcut/tamamlanmış ve doğrulanmış ekranlar alınır. |
| S08 | Videonun daha fazla görünür olması | S01’den sonra bağımsız dar görsel iş; S02 yayın kapısına tabidir. |
| S09 | Türkçe SSS’yi genişletme | S03–S05’te doğrulanan ürün yetenekleri temel alınır; S07’deki görsellerle çelişki kontrolü yapılır. |

Bu sıra bir otomatik dağıtım takvimi veya işler tamamlanmış gibi bir beyan değildir. Bağımsız işler ayrı değişiklikler olarak hazırlanabilir; bir işin beklemesi, diğerinde doğrulanmamış özelliğin varmış gibi anlatılmasına gerekçe olamaz.

#### S01 — GitHub Spec Kit entegrasyonu

**Uygulama adımları:**

1. Yerel yayımlanmamış değişikliklerin envanterini ve güvenli çalışma kopyasını oluştur; mevcut AGENTS.md, todo.md, sürüm araçları, test/CI ve yayın kurallarını oku. Kurulum için kullanılacak Spec Kit sürümünü kaydet ve sabitle; Codex entegrasyonunu resmi belgelerle doğrula. Başka bir site/proje oluşturma veya mevcut uygulamayı baştan üretme. Mevcut projede kurulum dosyalarının çakışmasını incelemek için ayrı, gözden geçirilebilir bir çalışma alanı kullan. Resmi mevcut-proje rehberi, yerinde başlatmanın var olan davranışları kendiliğinden spesifikasyona çevirmediğini açıklar. [Resmi mevcut proje rehberi](https://github.github.io/spec-kit/how-to/existing-projects.html)
2. Proje kurallarını constitution kaydına aktar: tüm CaseBridge kapsamı, büro/veri/anahtar izolasyonu, aday anahtarı ayrı test ve açık aktivasyon, önceki anahtarın korunması, sırların Git/log/browser storage’a girmemesi, main kaynaklı yayın, ayrı uygulama/tanıtım sürümleri ve `v.` etiketi, gerçek test kanıtı ve müşteri-release kapıları. Bu kuralların mevcut talimatlarla çatışmadığını kontrol et.
3. S02–S09 için ayrı gereksinim kayıtları oluştur: amaç, kapsam dışı işler, kullanıcı senaryoları, izinler, veri kaynakları, bağımlılıklar ve bu belgedeki kabul ölçütleri. Ardından teknik plan ve bağımlılık sıralı görev listesi üret; gereksinim, plan ve görevlerin birbirine izlenebilir bağlarını tut. Hataları/eksikleri uygulamadan önce gidermek için açıklığa kavuşturma ve tutarlılık kontrollerini kullan. Uygulama bittiğinde gereksinimlere karşı doğrulama ve kalan işlerin kaydını tamamla. Bu eşleme resmi SDD akışına dayanır. [Resmi SDD akışı](https://github.github.io/spec-kit/quickstart.html)
4. Kurulum aşamasında `.specify/` ve seçilen entegrasyonun ürettiği dosyaları gözden geçir; onaylı proje kayıtlarını izlenebilir tut, kullanıcıya özgü/sır içeren ayarları dışarıda bırak. Codex için belgelerdeki `$speckit-...` çağrı biçimini kurulu sürümle doğrula; constitution/specify/clarify/plan/checklist/tasks/analyze/implement/converge adımlarını terminal kurulum komutlarıyla karıştırma. Bu komutlar bu plan yazılırken çalıştırılmayacak. [Resmi çağrı biçimleri](https://github.github.io/spec-kit/integrations/cli.html#command-invocation)
5. Önce dar bir açık işi bu akışla ele al; tüm eski sistemi yeniden belgelemeyi entegrasyonun zorunlu ilk adımı yapma. İş sonunda hangi gereksinimin hangi değişiklik/test/yayın kanıtıyla karşılandığını kaydet; SDD kontrol listesindeki bir işaretin tek başına özellik tamamlandı anlamına gelmediğini koru.

**Kabul ölçütleri:** Seçilen CLI/entegrasyon sürümü ve kurulum farkı kayıtlı; mevcut kod/bağımsız çalışmalar korunmuş; constitution tüm kapsamı ve repo gereksinimlerini içeriyor; dokuz işin kimlik/bağımlılık ve kabul kayıtları izlenebilir. Seçilen ilk işte gereksinim → plan → görev → gerçek doğrulama zinciri gösterilebiliyor; salt belge/şablon üretilmesi tamamlanma sayılmıyor.

#### S02 — Main kaynaklı yayın ve sunucuda elle kod değişikliğini teknik olarak önleme

**Uygulama adımları:**

1. Mevcut uygulama ve tanıtım yayın yollarını, checkout’ları, Compose/Caddy yapılandırmasını, servis hesaplarını, dosya sahipliklerini ve Docker/sudo erişimini envanterle. Kod, sırlar, şifrelenmiş büro anahtarları, veritabanı, yüklenen belgeler ve günlükler için ayrı konumları belirle; gerçek değerleri envantere/loglara koyma. Ortak sunucudaki diğer servisleri koru.
2. Yayına alınacak main commit’ini seçip tam SHA ile sabitle. Temiz kaynak ağacından test edilmiş bir artefakt üret: uygulama için commit/sürüm etiketli imaj ve değişmez digest, tanıtım için dosya hash manifesti içeren sürüm paketi. Canlı sunucuda serbestçe düzenlenmiş checkout’tan build etmeyi kaldıracak hedef düzeni tasarla. Kaynağın main’den geldiği ve artefaktın aynı commit’e ait olduğu doğrulanmadan etkinleştirme yapma.
3. Rutin operatör hesabından kod/release dizinine yazmayı ve genel Docker/serbest root komutu çalıştırmayı kaldıracak yetki modelini belirle. Dağıtımı yalnız sabit, gözden geçirilmiş artefakt/commit kabul eden kısıtlı yayın komutuna ver. Uygulama kodunu yazılabilir host bind mount ile servis etme; uygun servislerde salt okunur kök dosya sistemi ve yalnız gerekli geçici/veri dizinlerine yazma hakkı kullan. Tanıtım paketlerini salt okunur sürüm dizininde sun ve etkin sürümü atomik değiştir. Ayrı build/deploy görevleri ve kullanıcılarıyla kod yazma, artefakt seçme ve servis çalıştırma yetkilerini sınırla. Root yöneticisini mutlak olarak engellediğini iddia etme; olağanüstü yönetici müdahalesi denetlenebilir olmalı ve kalıcı sunucuya özgü kod farkı yaratmamalı.
4. Sırları depoya, imaja veya tanıtım paketine katma. Korumalı sunucu yapılandırması/secret mekanizması ve kalıcı veri volume’larını sürüm artefaktından ayrı bağla. Mevcut büro anahtarı sürümleri ve eşleşen kurtarma yedekleri için repo şartlarını koru. Ön yüz değişikliği için gereksiz backend/DB restart veya migration yapma.
5. Etkinleştirmeden önce beklenen commit/sürüm/hash ile artefaktı karşılaştır; canlı servis kodundaki beklenmedik farkta yayın işlemini durdur. Yayın sonrası public sürüm, değişen kod/varlık hash’leri, health ve değişikliğe özel kullanıcı akışını doğrula. Ayrı uygulama/tanıtım sürümlerini ve çalışan commit/imaj digest’ini sır içermeyen yayın kaydına yaz.
6. Önceki doğrulanmış main sürümünün artefaktını, manifestini ve gerekli korumalı yapılandırma eşleşmesini tut. Geri alma komutu önceki artefaktı seçmeli; main’e force push veya sunucuda dosya yaması gerektirmemeli. Şema değişikliği varsa ayrı veri/migration geri alma ve kurtarma planını önce doğrula; yalnız kod imajını geri çevirmek veri geri alma sayılmaz.
7. Elle başlatılan veya otomatik başlatılan yayın seçeneklerini, yetki ve kontrol farklarıyla karara açık bırak. Kullanıcı seçimi olmadan webhook, her push’ta yayın, zamanlanmış tetikleyici veya dağıtım sıklığı varsayma. Bu karar, main’den izlenebilir artefakt alma zorunluluğunu değiştirmez.

**Kabul ölçütleri:** Rutin servis/operatör hesabıyla uygulama dosyasına yazma denemesi başarısız; uygulama kodu için yazılabilir mount yok; kısıtlı yayın yolu dışında serbest kod değiştirme/servis çalıştırma yetkisi yok. Main dışı veya hash/digest’i uyuşmayan artefakt etkinleştirilemiyor. Test ortamında önceki main artefaktına geri alma ve ardından public/health doğrulaması geçiyor. Her yayın kaydında tam commit, sürüm, artefakt kimliği ve doğrulama sonucu var; sır/veri kod artefaktında değil. Otomatik tetikleyici seçilmediyse belge bunu açıkça kararsız gösteriyor. Bunlar önce test ortamında kanıtlanmadan canlı güvenliği tamamlanmış sayılmıyor.

#### S03 — Yapay zekâ menülerini sidebar’dan header’a taşıma

**Uygulama adımları:**

1. Yukarıdaki yedi AI bağlantısı ve hub için mevcut rota/aktiflik, rol, platform ve kısıtlı hesap davranışını kaydet. Header’da hangi hesapta hangi erişimin görüneceğine dair izin tablosu oluştur; mevcut erişimi genişletme. İstemcide gizlemek tek başına yetkilendirme sayılmasın; sunucudaki büro sınırları aynı kalsın.
2. Mevcut header içinde yerleşimi planla; masaüstü ve dar ekranda aynı header erişimini koru. Mobilde alan daralırsa header içinden açılan uygun bir menü kullan; erişimleri yeniden sidebar’a taşıma. Tek ortak rota/bağlantı tanımı kullanarak kopya ve sapmayı önle; mevcut arama, bildirim ve kullanıcı menüsünü koru.
3. Aktif sayfa, doğrudan URL, geri/ileri gezinme ve alt rota aktifliğini koru. Klavye ile açma, Tab sırası, görünür odak, Escape ile kapatma ve odağı açan düğmeye iade etme davranışlarını belirle. Menü açılması yanlışlıkla özellik/analiz başlatmasın.
4. Rol/izin tablosunu, fare/dokunma/klavyeyi ve ilgili mevcut testleri uygula; en az 1440, 768 ve 390/320px ile açık/koyu tema kontrolü yap.

**Kabul ölçütleri:** Yetkili hesabın tüm mevcut AI erişimleri header’dan ulaşılabilir; sidebar’da ikinci AI grubu kalmamış. Platform/kısıtlı hesapların önceki erişim sınırları korunuyor; bürolar arası erişim açılmamış. Tüm bağlantılar doğru rotaya gidiyor, aktif link ve alt rota durumu doğru. Klavye odağı kaybolmuyor veya tuzak oluşturmuyor; mobilde taşma/menü çakışması yok; arama/bildirim/kullanıcı menüsü çalışıyor.

#### S04 — Emin’in Bilgi Haritası ile mevcut görünümü karşılaştırma ve uyum

**Uygulama adımları:**

1. Emin’in ilgili en güncel kaynağını ve bunun main’e alınan karşılığını tam commit’lerle tespit et. Karşılaştırılan uygulama derlemesi, veri dosyası/şeması ve tema/viewport sürümlerini kaydet. Kullanıcının fark gördüğü ekranı bu temele eşleştir; hangi kaynağın hedef olacağını kanıta göre belirle, “Emin’in güncel hali” diye tahmin yürütme.
2. Aynı sentetik örnek dosya/özet, aynı seçili kanun maddesi, aynı harita verisi, aynı tema ve ekran boyutunda karşılaştırma yap. Bilgi Haritası mevcut haliyle dosya girişi almıyorsa bunu açıkça kaydet; ona dosyaya özgü analiz özelliği atfetme. Ortak örnek dosya bağlamını sabit tutarken harita için asıl karşılaştırma anahtarlarını veri hash’i ve seçili madde oluşturur.
3. Farkları veri, grafik yerleşimi, filtre/arama, düğüm seçimi, ilişki ağırlığı, sağ detay paneli ve istatistik açıklaması olarak listele. Kaynak sürüm farkıyla tema/veri farkını ayır. Uyarlamayı yalnız doğrulanmış farklara ve kararlaştırılan hedefe uygula.
4. Madde arama/seçme, yakınlaştırma/kaydırma, bağlantı vurgusu, madde ve karar detayları, boş/başarısız veri durumları ve dar ekranı kontrol et. Veri kaynağı/lisans notunu ve oranların betimleyici niteliğini koru.

**Kabul ölçütleri:** Aynı örneğin iki taraftaki commit/veri/viewport bilgileri ve önce/sonra fark tablosu kayıtlı. Her uyarlama fark tablosundaki bir gerekçeye bağlı; kalan fark varsa açıkça açıklanmış. Aynı seçili madde için ilişkiler ve detaylar hedef kaynağa uyuyor. Düğüm etiketleri/bağlar okunabilir, etkileşimler çalışıyor; hata durumları anlaşılır. Bozulma/atıf oranı hiçbir yerde davanın kazanma olasılığı gibi sunulmuyor.

#### S05 — Olasılık Haritası / olasılık ağacı

**Uygulama adımları:**

1. Önce Emin’in mevcut kaynak, branch, prototip ve gereksinimlerinde olası örtüşmeyi araştır; ad/rota/API/veri modeli ve varsa örnek çıktıyı kaydet. “Mevcut”, “kısmen mevcut” veya “doğrulanamadı” sonucunu kanıtıyla yaz. Aynı işi yeniden üretmeden önce kullanılabilir kısmı ve eksik kapsamı belirle.
2. Varsa mevcut yapıyı aynı sentetik dosya üzerinde değerlendir; yoksa yeni geliştirme gereksinimini ayrı açık kapsam olarak netleştir. Bilgi Haritası’ndaki kanun bağlantılarıyla bu dosyaya özgü olay/senaryo dallanmasını karıştırma.
3. Kök olay/bulgu, dayanak belge, olası sonraki gelişme, alternatif dal ve sonuç senaryosu arasındaki ilişkileri tanımla. Her dalın hangi bilgi, varsayım ve eksik veri üzerine kurulduğunu; kaynak ve değerlendirme sürümünü gösterecek veri sözleşmesi planla. Erişim, saklama, güncelleme ve büro izolasyonunu kapsamla ilişkilendir.
4. Olasılık değerlendirmesinin nitel mi sayısal mı olacağını ve nasıl üretileceğini belirle. Hesaplama/kanıt yoksa “hesaplanmadı” veya açık nitel değerlendirme kullan; bilinmeyeni %0 yapma, boşluğu uydurma yüzdeyle doldurma. Sayısal oran düşünülüyorsa yöntem, veri yeterliliği, kalibrasyon ve belirsizlik kanıtını ayrıca kabul şartı yap. Tarihsel sıklık, model değerlendirmesi ve koşullu senaryo olasılığını ayrı adlandır; ilişkisiz/örtüşen dalları keyfen %100’e toplamayı hedefleme.
5. Dalların gerekçesini, karşı bulguları ve belirsizliklerini görünür kılan erişilebilir grafik ve metin alternatifini planla. Yeni belge/olgu geldiğinde önceki değerlendirmeyi sessizce ezmeden hangi dalların neden değiştiğini göster. Sentetik eksik/çelişkili veri örnekleriyle ve hukuk uzmanı incelemesiyle doğrula; sonuç veya başarı garantisi verme.

**Kabul ölçütleri:** Emin’de örtüşme kontrolünün kaydı ve yeniden kullanım kararı var. Sentetik bir dosyanın mevcut bulgularından en az iki alternatif gelişme/senaryoya dallanma gösterilebiliyor; her dalın dayanağı ve belirsizliği görülebiliyor. Hesaplanmamış/kalibre edilmemiş değerler doğrulanmış yüzde gibi gösterilmiyor. Yetersiz veri ve çelişkili bulgu açıkça gösteriliyor; karar destek niteliği korunuyor. Grafik/metin görünümü klavye ve mobilde kullanılabilir; büro/veri izolasyonu ilgili negatif kontrollerle doğrulanıyor. Varlığı doğrulanmayan veya kabulü bitmeyen özellik tanıtıma alınmıyor.

#### S06 — Koyu/açık temada logo tutarlılığı

**Uygulama adımları:**

1. `BrandLogo.tsx`, PNG, koyu SVG ve CSS `content` değişimini aynı boyutta karşılaştır; şekil, yazı, slogan, oran ve renk farklarını kaydet. Kullanıcının korumak istediği logo kimliğini mevcut sağlanan varlıklarla tanımla; yeni bir logo tasarlama.
2. Tek tutarlı logo bileşeni/varlık kullanımını planla. Koyu zeminde gerekli kontrast ile ürün kimliğini ayır; farklı şekil/slogan veya izinsiz marka değişimi yaratma. CSS ile görünmeyen kaynak değişimi, ölçekleme ve blend-mode etkilerini giderme kapsamını somutlaştır.
3. Giriş ekranı, header/sidebar ve mobil menüde açık/koyu geçişi, sayfa yenileme ve kayıtlı tema tercihinin yüklenmesini kontrol et; ilk yüklemede yanlış logo parlamasını ve bozuk görsel isteğini izle.

**Kabul ölçütleri:** Tema değişince farklı logo kimliği/şekli/sloganı ortaya çıkmıyor; oran ve hizalama tutarlı. Her iki zeminde okunabilirlik korunuyor, mobilde kırpılma/taşma yok. Yenileme ve tema tercihinin geri yüklenmesinde sonuç tutarlı; istekler başarılı ve alt metin mevcut. Önce/sonra görsel kanıt, kullanılan nihai varlık ve gerekçe kayıtlı.

#### S07 — Tanıtım ürün görsellerinin güncel gerçek uygulamayla eşleşmesi

**Uygulama adımları:**

1. Mevcut 11 sekmeyi ve büyütülen/ek ürün görsellerini listele; her biri için gerçek uygulama rotası, kaynak commit/sürüm, ekran dili, tema, sentetik örnek ve dosya yolunu eşleştir. Önizlemede yerelleştirilmiş veya eski sürümden alınmış kayıtları güncel çalışan ürünle ayrıca karşılaştır.
2. S03/S04/S06 sonrası kabul edilmiş ürün görünümünü temel al; Olasılık Haritası yalnız gerçekten mevcut ve kabul edilmişse kapsama ekle. Aynı sentetik veri/örnek dosya ve uygun viewport ile gerçek uygulamadan doğrudan yakala. Gerçek kullanıcı verisini, gerçek anahtarları ve özel dosyaları kullanma; sahte UI üretme veya görsel üzerine Türkçe etiket boyama. Üründeki İngilizce alan varsa görselde gizlemek yerine ilgili ürün yerelleştirme ihtiyacını gereksinim kaydına geçir.
3. Küçük görsel, tam boy bağlantı/dialog, açıklama ve alt metni birlikte güncelle; ekran ile açıklanan özellik uyuşsun. Kullanılan örnek veri, kaynak sürüm ve yakalama yöntemini CAPTURE_NOTES içinde kaydet; örnek mod/eğitim etiketlerini silme.
4. Tüm sekmelerde görüntü yüklenmesi, büyütme, Escape/odak iadesi, doğal boyutlar ve mobil ölçeklenmeyi denetle. Gerekiyorsa teslim kopyalarını içerik değiştirmeden optimize et.

**Kabul ölçütleri:** Kapsamdaki her görsel için çalışan ürünle güncel eşleme kaydı var; eski görünümü temsil eden uyumsuz görsel kalmamış veya gerçek engel açık iş olarak yazılmış. Türkçe açıklama ve görsel içeriği birbirini doğruluyor; büyütme aynı güncel dosyayı açıyor. Gerçek müşteri verisi/sır yok, ekranlar gerçek uygulama kaydı ve provenance kayıtlı. Masaüstü/mobilde bozuk resim, çarpılma veya sayfa taşması yok.

#### S08 — Beyaz video katmanını yeniden azaltma

**Uygulama adımları:**

1. Tamamlanmış v.0.43 katmanını yeni talep için başlangıç ölçümü olarak kaydet; önceki yayın kaydını açık işe çevirmeden koru. Masaüstü gradient durakları ve mobil katman için yeni değerleri karşılaştırmalı seç; kullanıcı ek video görünürlüğü istiyor.
2. Yalnız beyaz katmanın alpha/gradient değerlerini değiştir. Özgün video/poster, genel tema, metin renkleri, hizalama ve içerikleri koru. Okunabilirliği azaltan noktalar için aynı katmanın dağılımını değerlendir; bu işi genel tasarım yenilemesine genişletme.
3. Aynı video zaman noktalarında önce/sonra görüntü al; yalnız parlak ilk karede değil, daha koyu ve hareketli birkaç bölümde metin/CTA görünürlüğünü incele. Masaüstü/mobil ve hareket azaltma tercihinde poster görünümünü kontrol et.

**Kabul ölçütleri:** Video v.0.43’e göre belirgin biçimde daha görünür; kullanılan alpha değerleri önce/sonra kayıtlı. Başlık, açıklama ve düğmeler videonun denetlenen açık/koyu karelerinde okunabilir; uygun kontrast kontrolü ve görsel sonuç kaydı mevcut. Metinleri gizleyerek veya genel temayı değiştirerek elde edilmiş bir sonuç yok. Video oynatma, döngü, sessiz/satır içi davranış, ekran dışı durdurma ve hareket azaltma korunuyor; mobil taşma yok.

#### S09 — Ürünle doğrulanan Türkçe SSS genişletmesi

**Uygulama adımları:**

1. Mevcut dört soruyu koruyup eksikleri çıkar: dava analizi/duruşma farkı, Bilgi Haritası ve sınırları, karşı taraf analizi, yönetilen duruşma, hedef kullanıcı, çıktıların doğrulanması ve örnek mod gibi konular için aday soru listesi hazırla. Olasılık Haritası yalnız S05’te varlığı/teslimi doğrulanmışsa ürün özelliği olarak anlatılsın.
2. Her yanıtı doğrulanmış ürün rotası, davranış veya mevcut politika kaydıyla eşleştir; bu eşleme için kısa kaynak tablosu tut. Planlanan özellikleri mevcutmuş gibi, istatistikleri kazanma garantisi gibi veya doğrulanmamış fiyat/güvenlik/veri saklama koşullarını kesin vaat gibi yazma. Belirsiz konuyu yanıtlamadan önce ilgili gereksinimde açıklığa kavuştur.
3. Türkçe, kullanıcıya yönelik kısa ve anlaşılır yanıtlar yaz; görünür İngilizce arayüz metni ve görsellerle çelişki kontrolü yap. Yerleşimi mevcut temada koru; soru açma/kapama ve klavye davranışını bozma.
4. Yeni soruların ürün doğruluğunu ilgili sorumluyla gözden geçir; mevcut soruların da güncelliğini kontrol et. Açık/kapalı SSS, klavye/odak, JavaScript kapalı içerik ve 320/390px düzenini doğrula.

**Kabul ölçütleri:** Mevcut dört soruya eklenen, birbirini tekrar etmeyen sorular ve her cevabın ürün/politika dayanağı kayıtlı. Sayısal artış tek başına başarı sayılmıyor; seçilen eksik konular açıklanıyor. Tamamlanmamış özelliğe mevcut ürün vaadi veya garantili hukuki sonuç iddiası yok. Tüm görünür sorular/yanıtlar Türkçe ve ekranlarla uyumlu; mobilde okunabilir, klavye ve JavaScript kapalı kullanımda erişilebilir.

#### Her işin kapanış ve yayın kapısı

Bir iş ancak kendi kabul ölçütleri için gerçek sonuç, test/sürüm/veri kapsamı ve varsa kalan engel yazıldığında tamamlanmış işaretlenecek. Spec Kit gereksinim/plan/görev kayıtları bu sonuçlara bağlanacak. Yayın yapılacaksa önce S02’nin main kaynaklı artefakt kuralı, ardından uygulama/tanıtım için ilgili ayrı `v.` sürümü, değişiklik kapsamına uygun kontroller, korumalı geri dönüş kaydı, public commit/kod/sürüm ve health doğrulaması uygulanacak. Kod derlenmesi veya dağıtımın başlaması tek başına yayın tamamlandı kanıtı değildir. Yeni müşteri teslim/onboarding için yukarıdaki zorunlu müşteri-release maddeleri ayrıca tamamlanmış ve kanıtlı olmalıdır; bu plan onları değiştirmez veya otomatik tamamlamaz.


## Spec Kit ile v.0.20 / tanıtım v.0.44 — yerel doğrulama, yayın bekliyor

- Spec Kit CLI **1.4.3**, Codex entegrasyonu; resmi managed skills/templates korunur. Constitution 1.0.0 tüm projeyi kapsar. S02–S09 için sekiz bounded spec/plan/task/verification kaydı; governance kontrolü geçti. Otomatik dağıtım tetikleyicisi/sıklığı seçilmedi.
- Backend tam süit: **1098 geçti** (4 bağımsız pytest worker, 371.67s). Son ek health metadata testiyle birlikte 12 odaklı health/ağaç testi ayrıca geçti. Ön yüz: **753 geçti**; duruşma tutanak türlerinin gerçek Türkçe ürün metnine çevrilmesinden sonra 17 ilgili test ayrıca geçti. TypeScript ve production build geçti. Sürümün değişmeden doğrulanması için iki version-script testi ve `--check` geçti.
- Değişmez yayın aracı: 12 negatif/yetki/manifest/drift/geri dönüş testi geçti; kurulum dry-run ve Python compile geçti. Gerçek VPS kurulumu, yalıtılmış eski→yeni→eski imaj/health provası ve public doğrulama henüz bu satırda tamamlandı sayılmaz.
- Header, logo, ağaç/metin ve mobil: 1440/768/390/320 × açık/koyu tarayıcı matrisi geçti. Dokuz AI erişimi yalnız header’dan açılıyor; Escape/Tab/odak dönüşü, aktif rota, arama/bildirim/hesap menüsü ve kayıtlı tema sınandı. Büro izolasyonu, restricted/platform 403, başka büro 404 ve bozuk cross-tenant alt kayıt negatifleri geçti.
- Emin `134e881` ve başlangıç main `fdf7333` Bilgi Haritası kaynakları aynı. TMK m.6 / 1600×1100 seçili SVG hash’i aynı; açık/koyu kanıtlar `docs/map-comparison.md` ve `docs/validation/2026-11-22/` içinde. Geometriye dayanaksız uyarlama yapılmadı; ürün kaynak notu Türkçeleşti.
- Yeni `/ai/olasilik` teknik uygulaması hazır: kayıtlı senaryolar veya açık koşullu hazırlık dalları, dayanak/belirsizlik, `probability=null`, içerik sürümü ve bellekte önceki görüntü. Harita oranları veya analiz skoru olasılığa dönüştürülmez.
- S05 bağımsız hukuk uzmanı incelemesi yapılmış sayılmaz. Son açık kullanıcı talimatıyla bu asistan plan yorumu yeni bir yayın/tanıtım kapısı değildir; teknik kabul verilmiştir. Sentetik örnek `scenario-tree.jpg` gerçek uygulamadan alınmıştır.
- 12 gerçek v.0.20 production-build ekranı sentetik SQLite seed/template verisiyle doğrudan yakalandı. Görünür ilk 11 sekme yenilendi; ağaç görseli inceleme için tutulur. Üründe gereken çeviriler gerçek kaynağa işlendi; önizlemeye özgü override ve gerçek müşteri/sır yok. Rota/viewport/hash provenance `CAPTURE_NOTES.md` ve JSON kanıtında.
- Video v.0.43’e göre genel alpha 88/78/28/12 → 82/70/18/6, mobil 78 → 72. Kullanıcının ek kontrast yetkisiyle yalnız kopyada koyu marka tonu ve lokal yumuşak zemin kullanıldı; genel video/tema/hizalama korunur. Dört viewport × 0/5/12s + ilk hareket-azaltma posteri kontrol edildi; normal 4.5 ve büyük başlık 3 eşiğini 64 örnekte geçti, minimum **5.64:1**. Video ilerleme, sessiz döngü/satır içi, ekran dışı durdurma ve hareket azaltma geçti.
- SSS dört asıl + sekiz yeni = 12 ürün dayanaklı Türkçe soru. Klavye, mobil ve JavaScript kapalı native details kontrolleri geçti. Kesin sonuç, fiyat/saklama veya dış uzman onayı vaadi eklenmedi.
- [x] Main push, VPS artefakt/canary/rollback ve public commit/sürüm/kod/hash/health doğrulaması. Yayın tamamlandığında gerçek sonuç ayrıca eklenecek; çalışan build tamamlanmış yayın sayılmaz.

- Tanıtım görsel son kontrolü: dört viewport × 11 sekme = **44** yükleme/büyütme/Escape/odak kontrolü geçti; doğal görsel genişliği 1600 px, aynı kaynak tam ekran, bozuk görsel/taşma/page error yok. Yeni ağacın bağımsız uzman incelemesi açık olduğundan ilk 11 sekmeyle sınırlı; ağaç capture kaydı tanıtım bağımlılık paketine alınmıyor.


### Son kullanıcı açıklaması — teknik kabul ve tanıtım

Kullanıcı teknik uygulamayı ve gerçek ürün görsellerini onayladı; plan sırasında asistanın eklediği bağımsız hukuk uzmanı incelemesinin yeni bir canlı/tanıtım engeli yapılmamasını, test edilmiş Olasılık Ağacı’nın sentetik örnekle ilgili ürün bölümüne bağlanmasını açıkça istedi. AGENTS.md içindeki bağlayıcı ek müşteri-release şartları ayrı büro anahtarları, staged test/aktivasyon, sır koruması ve gerçek public doğrulamadır; bağımsız hukuki inceleme yayın kapısı olarak yer almaz. Bu son açık talimat önceki plan yorumunu değiştirir. Önceki “tanıtıma bağlanmaz” ara kaydı artık geçerli değildir. Bağımsız hukuki inceleme yapıldığı iddiası yoktur.

Ağaç 12. ürün sekmesine, aynı gerçek v.0.20 ekranına ve `/ai/olasilik` uygulama rotasına bağlandı. Hesaplanmamış olasılıklar açıkça etiketlenir; analiz skoru ve atıf oranı olasılığa çevrilmez. Public doğrulama kapısı aynen sürer.

- Son 12 sekmeli tanıtım kontrolü: 1440/768/390/320 × 12 = **48** görsel/tam ekran/Escape/odak denetimi geçti; uygulama bağlantısı gerçek `/ai/olasilik` rotasıdır. Önceki 11 sekme sınırı son kullanıcı talimatıyla kaldırıldı.

- Yayın öncesi CI bir ses kaydı yarışını yakaladı: conversation modunda ilk render opening eylemi kayıtta tutulabiliyordu. Gönderimde yalnız geçerli konuşma eylemi seçiliyor; 753 test son düzeltmeyle tekrar geçti. Salt sentetik local production build ve 12 capture yeniden alındı.
- Artefakt kapısı, Compose bağımlılık bloğuna yanlış giren hardening satırlarını reddetti; canlı v.0.19/v.0.43 değişmedi. Girinti düzeltildi; gerçek Docker Compose sentetik konfigürasyonla doğrulandı. Aynı denetim CI’ye ve imaj build öncesine eklendi. Başarısız stage yayın/artefakt tamamlandı diye kaydedilmedi.

- Runtime overlay birleşiminde yinelenen security_opt listeleri de gerçek Compose denetimiyle yakalandı. Yeni kaynak güvenlik listelerini base dosyasından alıyor; legacy geri dönüşe hardening ayrıca uygulanıyor. Gerçek base+overlay merge, sır içermeyen sentetik konfigürasyonla geçti; 12 release testi tekrar geçti. Bu düzeltmeler sırasında canlı uygulama etkinleştirilmedi.

- Nonroot canary, private umask 077 ile güvenli tar açılımının 0700 bıraktığı asset dizinini EACCES olarak reddetti. Git export izinleri açıkça normalize edildi; yayın komutu kendi umask’ını sabitliyor. 077 regresyonu dahil 13 release testi geçti. Bu aday da canlıya alınmadı; son kaynakla tekrar üretilecek.

- Son nonroot paketleme düzeltmesi: imajda public/sufle 0750 kalabildiği için Dockerfile runtime public/Next dosyalarında okuma/traverse izinlerini ayrıca açıkça ayarlıyor. Root sahipliği ve production read-only korunur. Kaynak/yerel production derleme ve 12 gerçek capture son fingerprint ile yenilendi. Geçersiz rollback isteği recovery sınırından önce reddedilir; 14 release testi geçti.


## Tamamlanan yayın — uygulama v.0.20 / tanıtım v.0.44

- Main kaynak commit’i **70fabd06f695f03477203a3fc86291f06e3e2f7c**. Uygulama ve tanıtım public release.json aynı commit’i, /api/health status=ok ve app version 0.20 döndürüyor. 54 frontend JS/CSS, 48 tanıtım dosyası ve çalışan backend/frontend kod hash’leri imaj/manifest ile birebir doğrulandı; kaynak artefaktı 897 dosya içeriyor. Son belge commit’i uygulama/tanıtım kodunu değiştirmez; çalışan kaynak commit’i bu kayıttır.
- CI’nin **üç işi de geçti**: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 . Backend **1099** test (Python 3.11, 715.67s), frontend **753** test, TypeScript, sürüm ve production build; Spec Kit governance, **14** release sınır/geri dönüş testi ve sentetik base+runtime Compose denetimi başarılı.
- Normal proje-agent/cb-release hesapları kod yazamıyor, genel sudo/Docker çalıştıramıyor. Kısıtlı status çalışıyor; main dışı SHA ve doğrulanmamış rollback reddediliyor, reddedilen işlemler servisleri yeniden başlatmıyor. Yeni frontend UID 1000; her iki app root filesystem read-only, ALL caps dropped, no-new-privileges. Gerçek runtime kod yazma denemeleri reddedildi. Yalnız storage/tmp/cache yazılabilir. Root ve izzet yönetici/kurtarma erişimleri korundu; yöneticiyi mutlak engellediği iddiası yok.
- Önceki doğrulanmış **b640c54** imaj/manifestleri tutuldu. Gerçek yalıtılmış eski → yeni → eski imaj çevriminde backend sentetik health/auth, frontend HTTP ve read-only kontrolleri geçti; üretimde gereksiz rollback yapılmadı. Şema değişikliği yok. Korumalı yapılandırma, şifreli anahtar sürümleri ve DB için sunucuda eşleşen yedek var; yapılandırma/şifreli anahtar sürümleri yayın öncesiyle aynı. Gerçek sırlar kayda veya browser storage’a yazılmadı.
- Public uygulama JS’i 1440/390 ve açık/koyu temalarda sentetik API yönlendirmesiyle sınandı; gerçek müşteri verisi kullanılmadı. Dokuz header AI bağlantısı, focus/Escape, ağaç/metin/sources/uncertainties ve taşma kontrolleri geçti. Production ağaç API’si kimliksiz isteğe 401 verdi. Public tanıtımda 1440/390/320 × 12 = 36 görsel/dialog/odak akışı, SSS ve uygulama bağlantısı geçti; page error ve bozuk statik varlık yok.
- Video normal/büyük yazı eşikleri geçti: 64 hero örneklemi min **5.64:1**, CTA normal/hover renkleri ayrıca min **4.58:1**. Özgün film/poster, tema ve hareket davranışı korundu; genel örtü artırılmadan yalnız kopyada lokal yumuşak zemin ve koyu marka tonu uygulandı.
- Kullanıcı son yanıtında **“İncelemeyi tamamladım ve kabul ediyorum”** dedi. Kullanıcı inceleme/kabul beyanı kaydedildi. Asistan bağımsız hukuki audit veya model kalibrasyonu yapmış gibi sunulmuyor. Ağaç; kaynak, gerekçe, koşul ve belirsizlikleriyle 12. tanıtım sekmesinden ve /ai/olasilik rotasından erişilebilir; olasılıklar Hesaplanmadı.
- S01–S09 görevleri kendi gerçek kanıtlarıyla kapatıldı. Otomatik yayın tetikleyicisi/sıklığı eklenmedi. Ek müşteri teslim/onboarding bu çalışmanın parçası değildir; AGENTS.md’deki ayrı büro anahtarı ve staged test/aktivasyon kapıları korunur.

Kanıtlar: `docs/validation/2026-11-22/`, özellik bazında `specs/*/verification.md`, yayın/geri dönüş için `deployment/immutable-release.md`.

İnceleme beyanının kaynağı, S05 için ayrı gönderilen soruya kullanıcının doğrudan verdiği “İncelemeyi tamamladım ve kabul ediyorum” yanıtıdır; önceki uygulamaya başlama onayıyla karıştırılmaz. Bu yalnız kullanıcı beyanı/kabulüdür. İncelemeyi yapan kişinin uzmanlığı/bağımsızlığı ve inceleme bulguları tarafımızca doğrulanmadı; bağımsız hukuki doğrulama ve model kalibrasyonu yapılmış sayılmaz. Teknik yayın tekrarlanmadı.


## Onaylanan takip işi — Olasılık Ağacı POC demo ağırlıkları

Kullanıcı “Demo tahmini, tamam, yazabilirsin, okey, hadi devam edelim” diyerek örnek/sentetik davada tahmini senaryo ağırlığını açıkça onayladı. `specs/009-demo-scenario-weights/` kapsamında ilerlenir. Bu kural gerçek dosya kazanma olasılığı değildir, kalibrasyon iddiası yoktur; kayıtlı skor/harita oranı yüzdeye çevrilmez.

- [x] Ayrı, server-owned sentetik örnek; gerçek dosya/example/provider bayraklarından oran etkinleştirme yok.
- [x] Denetlenebilir puan kuralı, varsayım değişimi, görünür katkılar ve yalnız tek MECE soruda %100.
- [x] Son kullanıcı yönlendirmesi: örnek ve normal dosya senaryo dallarında sayısal Demo tahmini; eksik örnek kayıtta eşit dağılım, normal dosyada dayanak yoksa 50/100 nötr başlangıç. Normal dosya puanları bağımsız/toplamlanmaz; probability null kalır.
- [x] Keşfedilebilir gerçek giriş/deep link; grafik/metin, mobil/klavye ve eski yanıt yarışları doğrulanacak.
- [x] Tanıtım/SSS ve gerçek örnek görseli güncellendi; app v.0.21 / tanıtım v.0.45 main 1b460a6 artefaktı public kod/hash/sürüm/health ile doğrulandı.

No new customer delivery, no real key operation or automatic deployment trigger is authorized by this follow-up. Existing staged bureau key and release rules remain.

Son kapsam açıklaması: Kullanıcı demo değerlerinin normal büro dosyalarında da görünmesini ve POC senaryo sunumunda Hesaplanmadı yerine görünür nötr/eşit başlangıç kullanılmasını açıkça istedi. Önceki sentetik-only/null ara planı bu takip işinde geçersizdir. Yalnız aynı sorunun MECE örnek grubu %100’e tamamlanır. Normal dosyalarda kullanıcı varsayımı ve doğrudan bağlı kayıt sayısıyla açıklanan bağımsız 0–100 destek ağırlığı vardır; hukuki kazanma olasılığı değildir. İnceleme/kabul beyanı yukarıdaki doğrudan kullanıcı yanıtıdır.

Takip işi yerel sonuç: 12 hedefli backend + 7 arayüz testi geçti; ek health ile backend 15/15. TypeScript, üretim build, 14 release testi, sentetik Compose ve Spec Kit governance geçti. 1600/390/320 × açık/koyu temada gerçek örnek/normal dosya akışı geçti; page error/taşma yok. Tam süitler son kritik-test talimatıyla durduruldu ve başarılı sayılmaz. App v.0.21 / tanıtım v.0.45 hazırlanmıştır; public doğrulama aşağıda ayrıca kaydedilmeden yayın tamamlandı sayılmaz.

## Onaylanan ek iş — GitHub main koruması ve çalışan Spec Kit kabul kapısı

- [x] Main PR zorunluluğu, force push engeli, boş bypass listesi; ikinci kişi onayı yok. GitHub Actions gerçek spec-governance (15368) zorunlu ruleset etkin (27816126).
- [x] Davranış diff’i gereksinim + değişen isimli/assertion içeren kabul testine bağlandı; seçilen testler gerçekten çalışıyor, skip/xfail/todo kabul edilmiyor. PR #27 korumalı yoldan main’e alındı; belge-only iş muaf.
- [x] PR #28: eksik bağda spec-governance FAILURE ve BLOCKED; aynı PR’da bağ/test eklenince SUCCESS ve MERGEABLE. İsteğe bağlı işler sürerken UNSTABLE, tüm CI geçti diye sunulmadı. PR kapalı, mergedAt=null; deneme kodu main’de yok.
- [x] Gerçek kurallar ve provider 15368, PR/check sonuçları/sınırlar docs/validation/2026-11-22/main-protection-results.json ve specs/001-main-release/verification.md içinde. Demo yayını ayrı; koruma app yeniden yayını gerektirmedi.

### Demo takip yayını tamamlandı — v.0.21 / v.0.45

Main kaynak `1b460a691af375da61e18014733ed0ca0c10b1a5`; restricted stage/canary, gerçek yalıtılmış eski→yeni→eski, activate/verify geçti. Public app/site release.json ve health aynı commit/sürümü doğruluyor; 917 kaynak, 54 frontend JS/CSS ve 48 tanıtım dosyası manifest/imajla eşleşiyor. Public JS ile 1600/390/320 × açık/koyu temada örnek ve normal dosya varsayım akışları geçti; API yanıtları yalıtılmış sentetik backend’den geldi, müşteri verisi okunmadı. Gerçek üretimde health ve iki kimliksiz API 401 sınırı doğrudan kontrol edildi. Public güncel görsel hash’i ve 1440/390/320 tanıtım görsel/SSS/dialog/odak kontrolleri geçti. Yapılandırma ve şifreli anahtar sürümleri aynı; yeni korumalı DB/yapılandırma/şifreli sürüm yedeği ve önceki doğrulanmış artefakt tutuldu. Yeni müşteri teslimi veya anahtar işlemi yapılmadı. GitHub koruma takip işi ayrı kayıttır.

## Onaylanan tanıtım takibi — Olasılık Ağacı ilk ve varsayılan

- [x] Mevcut ağaç tek kez ilk ve varsayılan; analiz ikinci, diğer sıra/rota/açıklama aynı. 12 gerçek görsel yeni sol menülü app v.0.22 ile güncellendi.
- [x] Yerel ve public masaüstü/mobil ilk açılış/ARIA/klavye/dialog geçti; PR #29 zorunlu kabul testleriyle korumalı main’e alındı.
- [x] Sonradan açıkça eklenen uygulama sidebar isteğiyle birlikte app v.0.22 / site v.0.46, main 80035ea all artefaktından yayımlandı. Değişmeyen backend imajı yeniden kullanıldı. Public varsayılan içerik/kod/sürüm/health doğrulandı; önceki yalnız-marketing ara kapsamı son uygulama isteğiyle genişledi.

## Son onay — Sol CaseBridge AI grubu geri, tüm menü tek bakışta

Header AI erişimi korunacak. Dokuz yetkili AI aracı sidebar’da ayrı başlık altında tek sütun, ilk açılışta genişletilmiş ve ek tıklamasız gösterilecek. Parlak mavi tüm-grup çerçevesi yok; seçili satır/klavye odağı ve platform/restricted sınırları korunacak. Tam admin menüsü 900/768px yüksekliğinde DOM geometriyle doğrulanacak; kısa/mobil/yüksek zoom alanında kaydırma erişimi kalacak. Uygulama v.0.22, tanıtım v.0.46 hazırlanacak; ikisi korumalı PR/main artefaktıyla ve gerçek public doğrulamayla yayımlanacak.

Sol menü yerel kanıt: 15 hedefli test, production build/typecheck geçti. Gerçek tam admin menüsü 20 bağlantı; 1440×900 ve 1280×768 × açık/koyu temada tümü tek bakışta görünür, minimum satır 24px; ilk bağlantı top 69.58px, son bottom 855/723px. 390×844, 320×568 ve 720×384 dar CSS alanında scroll/odak erişimi geçti. 720×384 zoom eşdeğeri dar alan testidir; gerçek browser zoom doğrulaması iddia edilmez. Header dokuz AI bağlantısı korunur. Public app v.0.22 / site v.0.46 doğrulaması henüz bu satırla tamamlanmış sayılmaz.

### Son yayın tamamlandı — uygulama v.0.22 / tanıtım v.0.46

Korumalı PR #29 → main `80035eaea87f07445d375d8848ee7e8bee8ae8b5`; zorunlu spec-governance içindeki 6 isimli kabul testi ve otomatik frontend kontrolü geçti. Değişmez stage/canary, yalıtılmış eski→yeni→eski, activate/verify başarılı. Public 929 kaynak/54 frontend JS-CSS/48 tanıtım dosyası manifestle eşleşti. App v.0.22 etiketi/release.json, site v.0.46 ve doğrudan health ok doğrulandı. Backend değişmedi/reuse: kendi health kimliği 1b460a6/0.21 olarak korunur; frontend güncel kimliği 80035ea/0.22’dir.

Public tam admin menüsünde 20 link (9 AI + Ayarlar dahil), 1440×900 ve 1280×768 × açık/koyu temada aynı anda görünür. 390×844, 320×568 ve 720×384 CSS alanında kaydırma/odak ve header dokuz AI erişimi geçti. Gerçek browser zoom iddia edilmez; dar CSS alanı sınandı. Public tanıtımda 1440/390/320 × JavaScript açık/kapalı ilk açılış/yenileme: tek ve ilk seçili Olasılık Ağacı, analiz ikinci, klavye/dialog/odak ve 12 güncel görsel hash’i geçti. Page error/taşma yok. UI akışları actual public JS + sentetik yalıtılmış API ile; gerçek müşteri verisi/sağlayıcı/anahtar kullanımı yok. Doğrudan health ve kimliksiz demo 401 gerçek üretimde sınandı.

Yapılandırma/şifreli anahtar sürümleri değişmedi; yeni korumalı eşleşen DB/config/şifreli-sürüm yedeği ve önceki doğrulanmış artefakt tutuldu. Main ruleset 27816126 etkin; PR zorunlu/force-push engelli/bypass listesi boş/spec-governance GitHub Actions 15368 zorunlu/ikinci kişi onayı yok. Deneme PR #28 başarısız-BLOCKED → aynı PR düzeltmesinde required SUCCESS/MERGEABLE, opsiyonel işler sürerken UNSTABLE; kapalı ve mergedAt=null, deneme kodu main’de yok. Tam CI geçti iddiası bu probe için yapılmaz. Önceki demo yayını 1b460a6’nın üç CI işi sonradan başarıyla tamamlandı. Yeni manuel tam süit başlatılmadı veya beklenmedi.

Kanıtlar: docs/validation/2026-11-22/main-protection-results.json, sidebar-release-results.json, sidebar-public-results.json, tree-first-public-results.json. Bu v.0.22 kanıt kayıtları uygulama/tanıtım/deployment kodunu değiştirmez; sonraki v.0.23 UI takip değişikliği ayrı yayın gerektirir. Ayrı büro anahtarları/staged aktivasyon ve ek müşteri teslim kapıları aynen korunur; yeni onboarding yapılmadı.

## Son görsel düzeltme — yüksekliği dolduran menü, eski mavi AI kutusu, platesiz özgün logo

Kullanıcı kompakt v.0.22 düzenini son görünüm saymadı: normal 256px sidebar’da logo üstte/Ayarlar altta, aradaki araçlar 768/900/1080px yükseklikte orantılı alan dolduracak; büyük boşluk olmayacak, kısa/mobilde kaydırma sürecek. Eski mavi kutu açıkça yeniden onaylandı; b640c54 koyu panel/bg-ai-glow kaynak stili geri gelir. Önceki mavi-kutu-istemiyor yorumu bu kapsamda geçersizdir. Header, izinler ve açık tek sütun korunur.

Logo: kaynak PNG’de alpha tamamı 255 ve köşeler beyaz; kapsayıcıda ayrıca #fff plate var. Sahte fontlu mevcut dark SVG özgün çizim olmadığı için kullanılmaz. Özgün PNG baytları korunup plate kaldırılır; beyaz matte render katmanında zemine blend edilir, koyuda aynı geometri okunur renklerle render edilir. Şeffaf görünümlü UI hedefidir; yeni transparan PNG üretildiği iddiası yok. Açık/koyu/alternatif zeminlerde piksel ve geometri gerçek sonuçları kaydedilmeden kapanmaz.

Bu takip uygulama v.0.23 olarak ayrı korumalı PR/app scope yayınıdır. Tanıtım v.0.46 ve ilk/varsayılan Olasılık Ağacı korunur; değişmeyen tanıtım için tekrar görsel/yayın turu başlatılmaz. Önceki v.0.22 public sonuçları tarihçe olarak saklanır.

Yerel takip sonucu: 11 hedefli Sidebar/BrandLogo testi ve üretim build/typecheck geçti. 768/900/1080px × iki temada 20 link kaydırmasız; satırlar 28.39/35.34/44.81px, AI→Ayarlar boşluğu 21px; normal genişlik256px. 10 logo piksel kontrolünde beyaz matte noktaları arka planla ±1RGB, minimum ana-ink kontrast4.24:1; özgün PNG hash/baytları değişmedi. Dar alan ve %200 CSS metin boyutunda scroll/odak geçti. Otomatik altyapı ayrı yürütücüye devredildi; burada hiçbir workflow/deployment düzenlemesi yapılmadı. UI PR’ı güncel main’den yetkili auto-merge/pilot yayını bekleyecek; bu takip için elle VPS yayını yapılmayacak.
## Hızlı UI yayını — kullanıcı onaylı

- [x] Arayüz kapsamını seçen testli allowlist ve değişmez ana dal yayın aracına otomatik tetik. Karma ve altyapı değişiklikleri standart akışta kalır.
- [x] Zamanlayıcının VPS kurulumu ve gerçek korumalı UI PR'ından otomatik yayın ile canlı kimlik, sağlık ve kalıcı servislerin değişmediğinin doğrulanması. PR #32 → v.0.23. Birleşmeden 19 sn sonra otomatik başlangıç, 1 dk 46 sn içinde canlı doğrulama. [Kanıt](specs/001-main-release/verification.md#fr-009-automatic-production-ui-pilot).

## User-authorized automatic versioned product gallery

- [x] Separate specs/010-versioned-gallery implementation detects either public version, captures all current native public frontend product routes against synthetic-only API, rejects partial/raced batches, preserves tree-first/default, versions normal image/zoom URLs and suppresses the output release loop.
- [x] Six targeted tests and local HTTP end-to-end pipeline and actual12-route public native capture passed;73 synthetic API requests all200, no browser errors/production API forwarding. Isolated evidence in specs/010-versioned-gallery/verification.md; no current published images changed by this validation.
- [x] Reviewed protected-main workflow, scoped Actions PR setting and exact policy installation complete. Actual botPR51 automatically passed genuine CI and merged; timer published marketingv.0.48/da78, every12publicimageSHA/health verified. Subsequent44985846872 verified public48 and skipped capture/publication (no self-loop). Both version branches have isolatedHTTP end-to-end/CI acceptance; actual production cycle app23/site47→site48, no artificial extra app release.
## Güncel public ürün görselleri — tanıtım v.0.47

- [x] Canlı frontend v.0.23 / f625960 doğrulandı; tanıtım v.0.46, health ok (değişmeyen backend kendi 1b460a6/0.21 kimliğini korur). Eski galeri provenance22 ve mevcut kabul testi uyumsuzluğu doğrulandı.
- [x] 12 gerçek public frontend ekranı yalnız yerel sentetik/mock API ile yakalandı; güncel şeffaf logo/mavi AI panel/dengeli sidebar, rota/sürüm/hash kanıtı. Gerçek hesap/büro ve API anahtarı kullanılmaz.
- [x] Tree-first/default, sekme-görsel eşleme ve büyütme/klavye/odak masaüstü-mobil korundu;3 hedefli sözleşme ve36 public akış geçti, korumalı PR45 birleşti.
- [x] Yalnız marketing v.0.47, mevcut otomatik sürüm ayrıştırma hatası nedeniyle kısıtlı standart stage/activate/verify fallback ile yayımlandı;12 publichash, sürüm/kimlik/health ve galeri kontrolleri doğrulandı. Otomatik47yayını iddiası yok; uygulama/backend kaynakları değişmedi.

Galeri v.0.47 önbellek talimatı: tüm img src/zoom href (ve aynı görselleri tekrar kullanan iki referans) normal URL’lerine yayın sürümü anahtarı eklendi; elle cache-bust yok. Önce eski normal URL’ler cache’e alındı; yayın sonrası aynı profile normal reload ile 12 yeni hash ve Canlı Duruşma v.0.23 kontrol edilecek. Çevrimdışı/açık eski HTML’yi uzaktan zorla değiştirme iddiası yoktur.

Yerel galeri47: 3 hedefli sözleşme testi ve 1440/390/320px ×12=36 görsel/zoom/odak akışı geçti. Yeni normal HTML URL’leri ?v=0.47 taşır, büyütme aynıJPEG/sorgu anahtarını kullanır; tree-first/klavye/taşma kontrolü geçti. Eski normal URL’lerle browsercache12hash ısıtıldı; yayınsonrası aynı profilde normalreload/all12native-pixelhash doğrulaması geçti (aşağıdaki public47kanıtı). Kalıcı otomasyonun tamamlanması bu tek-seferlik yayın için bağımlılık yapılmadı.

### Public v.0.47 verified — actual restricted standard fallback

PR45 merged as e6d1574fb801730f9ea38905ed26405261d4e89a. The existing automatic publisher rejected the actual v.0.47 marketing label; the reviewed restricted standard marketing stage/activate/verify path published this one-time release. This is not described as an automatic publication. Public app remains0.23/f625960, backend identity remains1b460a6/0.21, health ok.

All12 public normal-HTML image URL SHA256 values match the current native23captures;36 desktop/mobile tab/modal/focus flows, tree-first/default and keyboard checks pass. A persistent profile first warmed on46 then performed ordinary page reload (no cache clear or manually appended query); every12 browser-rendered natural-pixel digest equals the new23 JPEG decoded pixels. Public conversation footer visually showsv.0.23. Evidence: docs/validation/2026-11-22/gallery47-public-results.json and gallery47-cache-after.json. No customer data, real credential operation or additional customer rollout.

### Automatic complete gallery48 published and verified

Actual44985580863 SUCCESS:12 fresh native publicapp23 captures with disposable synthetic/mock API,73proxied200requests, no productionAPI forwarding/browser errors. BotPR51→protectedmain da78face86e246b4b9db2e89ca1573269c8f89ca, genuine own-PR CI44985738248 approved automatically with ephemeral token; no storedPAT, fake status or branch bypass. Timer marketing-only transaction13sec; all12 shipped ?v=0.48 SHA/public identities/health and immutable verifier pass, all7container IDs unchanged. Independent36desktop/mobile tab/modal/keyboard flows pass; initial focus matcher transient and diagnostic rerun honestly recorded. App remains23/f625, backend remains21/1b460a6. No new customer/key operation.

Subsequent ordinary44985846872 SUCCESS: actual public48bytes/identity/health checked, capture/publication skipped, no newversion/PR. Standing five-minute polling and app/marketing version-file triggers active; GitHub scheduling may delay. Evidence specs/010-versioned-gallery/verification.md and docs/validation/2026-11-22/gallery48-*.json. Final evidence-only update changes no runtime/version/gallery and requires no policy bootstrap.

## İncelemeye hazırlanan etkileşimli Rehber — v.0.24

- [x] Güncel origin/main c994bb4 üzerinden ayrı dal; oturum header sağ üstünde masaüstü/mobil görünür Rehber, sayfa/sekme/rol bağlamı, konu seçimi, önceki/sonraki/baştan başla/çıkış.
- [x] Büro Yönetimi 17 bölüm; kritik süre, yedek/doğrulama, toplu devir/teslim teyidi, inceleme/onay, açık müvekkil yayını iş akışları kaynakla doğrulandı. Platform, avukat ve kısıtlı kapsam ayrımı korunur.
- [x] 23 hedefli frontend testi ve final 5 rehber testi; üretim build/typecheck; 30 gerçek Chromium rol/genişlik/tema senaryosu. Rehber okurken sıfır ağ isteği/yazım/URL-storage değişimi, sayfa hatası/taşma yok. Spec 011 ve docs/validation/2026-11-22/workspace-guide-browser.json.
- [x] İncelemeye hazır PR #55 oluşturuldu; #54 CaseBridge Projects In Review. Diff kabul kapısındaki 4 isimli test gerçekten çalışıp geçti.
- [x] Rehber, #55 ile korumalı main dalında birleşti.
- [x] Rehberin birleşik v.0.26 sürümü genel uygulama adresinde doğrulandı.
## Onaylanan ekip içerik güncellemesi — 22 Kasım 2026

- [x] Emin Merden'in yerel CV'si metin/render incelendi; yalnız kısa mesleki tanıtım kullanılır, ham PDF/özel iletişim bilgileri depoya veya siteye eklenmez.
- [x] İzzet: iş geliştirme ve iş ortaklıkları; Emin: yapay zekâ ve veri. Bengü: mevcut belgelenmiş ekosistem ilişkileri katkısı; yatırım ifadesi eklenmez. Hatice ve Ahmet'in ilgili içerikleri korunur.
- [x] Hedefli kabul ve altı JS açık/kapalı masaüstü/mobil görünüm geçti. Ayrı protected PR #56 → main444c520; mevcut timer marketing v.0.49 yayımladı. Normal public ekip metni ve HTML SHA256 kaynakla aynı, release.json49/444c520 ve restricted verify/health ok. Rehber işiyle birleştirilmedi; yeni müşteri teslimi/anahtar işlemi yok. Kanıt specs/011-team-roles/verification.md ve docs/validation/2026-11-22/team-*.json.

## Onaylanan Emin portresi takibi — 22 Kasım 2026

- [x] Kullanıcının onayladığı hazır portre yalnız720×720 web JPEG boyutuna küçültüldü; görsel içerik/renk/yüz değiştirilmez. Emin'in EM alanı gerçek img ve Emin Merden alt metniyle değiştirilir; Yapay zekâ ve veri unvanı, biyografi ve diğer üyeler korunur.
- [x] Dört hedefli kabul ve altı local/public JS açık/kapalı masaüstü/mobil görünüm geçti. PR58 → protected main ebe5f51; mevcut timer marketing v.0.50 yayımladı. Normal public portre dosya/hash/decode/alt/kadraj, HTML hash ve release.json50/ebe5f51, restricted immutable verify ve health ok. Tüm ekip metinleri/diğer üyeler korundu; ilgisiz işler ve yeni müşteri teslimi yok. Kanıt specs/011-team-roles/verification.md ve docs/validation/2026-11-22/emin-portrait-*.json.

### Rehber konumu kullanıcı düzeltmesi
- [x] Son açık talimatla header CaseBridge AI düğmesi kaldırılıp aynı konuma Rehber kondu; tıklamak etkileşimli rehberi açar. AI araçları sol menüde korunur.
- [x] 22 hedefli test, final production build/typecheck/version check ve 30 Chromium senaryosu geçti; her senaryoda header AI yokluğu ve rehber işlevi doğrulandı. PR #55 güncellenir, In Review kalır. Public yayın yapılmadı.

## İncelemeye hazırlanan geniş örnek ekip — v.0.24 adayı
- [x] Örnek verileri yükle:12 farklı isim/uzmanlıkta ÖRNEK avukat, tenant-bağlı sabit kimlikler, yalnız örnek dosya kapsamı; ortak parola/otomatik davet yok. Önceki örnek portföy ilk kez dağıtılır, tekrar yükleme sonradan yapılan atamaları korur.
- [x] Admin panelinde tüm avukat isimleri okunur; yalnız örnek dosya için örnek avukat seçimi, gerçek ve bürolar arası atama engeli, standart yeni/düzenle listelerinde örnek ekip yok.
- [x] İlk10 backend testi geçti; geniş25 hedefli kontrolün24ü geçti, örnek hesap için yanlış normal-login test yardımcısı düzeltildi ve kalan1 test geçti. Frontend hedefli testler/build/typecheck ve gerçek yerel backend+UI ile6 masaüstü/mobil/açık-koyu akış geçti. Kanıt specs/012-expanded-demo-team ve docs/validation/2026-11-22/expanded-demo-team-browser.json.
- [x] Örnek ekip #61 ile main dalına alındı ve v.0.26 içinde yayımlandı.

- [x] Ayrı PR #61 ve iş #60 In Review; 9 davranış dosyasına bağlı4 gerçek kabul testi başarılı çalıştı.32 hedefli frontend testi geçti. Canlı import veya yayın yapılmadı.

### Kullanıcı ek isteği — Örnek verileri kaldır
- [x] Ayarlar’da salt okunur sayım önizlemesi, Vazgeç/Escape, açık kalıcı kaldırma onayı; büro kapsamı, değişen planda409, çift işlem kilidi, boş durum ve hata sonrası tekrar. Örnek dosyalara sonradan eklenen içeriğin de silineceği açıkça yazılır.
- [x] Kesin şablon kimlikleri + bilinen işaretli davalar; gerçek/diğer büro kayıtları ve ayarlar korunur. Kullanılmış/değiştirilmiş örnek hesaplar ve gerçek dosya kapsamları tutulur; yalnız silinen örnek erişim kimlikleri temizlenir. Dosya silme DB commit sonrası ve storage/paylaşılan-dosya kontrolüyle.
- [x] Üç backend kaldırma/izolasyon/stale-plan/rollback/yeniden yükleme testi geçti;19 hedefli arayüz testi geçti. Tarayıcıda bulunan odak dönüşü hatası düzeltildi. Final kodun build/tarayıcı ve diff kabul sonuçları specs/012-expanded-demo-team/verification.md içinde ayrıca kaydedilir.
- [x] PR61 kaldırma işlemiyle güncellendi; In Review. Final3 backend/19 frontend, production build/type/version ve6 gerçek tarayıcı kaldır/yeniden yükle akışı geçti;10 davranış dosyası9 isimli kabul testiyle doğrulandı.
- [x] Örnek verileri kaldırma akışı v.0.26 içinde yayımlandı ve yalıtılmış verilerle sınandı.

## Dava dosyası ve görev panosu · v.0.25 adayı

- [x] Dava detayında belgeler, dosyaya bağlı emsaller, kayıtlı sonuç ve etkileşimli Olasılık Ağacı. Sonucu eksik kapalı bir davaya yetkili kullanıcı kararını ekleyebilir.
- [x] Beş aşamalı görev panosunda sürükle bırak ve aşama seçimi, görev notları, dosya kapsamında avukata atama, öncelik ve son tarih.
- [x] Beş kategoride değişken sonuçlar üreten on ek kurgusal dava ve dört CSV raporunda tablo önizlemesi.
- [x] Üretim derlemesi, sürüm kontrolü, 14 isimli kabul testi ve masaüstü/mobil tarayıcı akışları geçti. Ayrıntılar specs/013-case-workspace-board/verification.md içinde.
- [x] #63 ve #55 birlikte 9bfc8a9 revizyonunda birleşti. Üretim kodu, v.0.26 sürümü ve sağlık kontrolü doğrulandı.

Birleşik yayın kaydı ve geri dönüş provası [v.0.26 doğrulamasında](specs/001-main-release/verification.md#workspace-release-v026) bulunur.

## Ayrı rehber sayfası ve ekran turu · v.0.27 adayı

- [x] Sağ üstteki Rehber, ilgili konuyu /rehber sayfasında açar. Her konuda amaç, menü konumu, ayrıntılı adımlar ve ekran bağlantısı bulunur.
- [x] Davalar, Görevler, Raporlar, Admin Paneli ve Hesabım turları ekrandaki kontrolü vurgular. 771 arayüz testi, 34 sentetik Chromium senaryosu, üretim derlemesi ve Spec Kit kontrolleri geçti.
- [x] [PR 65](https://github.com/Phoneria/CaseBridge/pull/65) korumalı main dalında birleşti. v.0.27 ve 57 arayüz dosyası canlıda doğrulandı. Açık üretim oturumunda Raporlar turu, yalıtılmış verilerle beş turun toplam 34 tarayıcı kontrolü geçti. [Yayın kaydı](specs/011-workspace-guide/verification.md#production-release-v027)

## v.0.28 · Verified fictional case files

Released from GitHub main commit `c52d2952963a973f902e6d384b25d4cabf563a0f`. Public version, health, code and rollback rehearsal passed. The live workspace reported 20 files and 478 PDF documents. [Acceptance results](specs/014-demo-case-files/verification.md)

## Anonimleştirme ekranı — v.0.43, 23 Kasım 2026

- Mevcut anonimleştirme motoruna büro oturumuyla erişilen, kayıt tutmayan metin maskeleme API’si ve sidebar bağlantılı ekran eklendi. Metin yapıştırma, maskeleme, kategori özeti, kopyalama ve temizleme desteklenir. Platform/kısıtlı hesap sınırları korunur; global AI maskeleme ayarı değiştirilmez.
- 791 frontend testi, üretim build/type kontrolü, 20 release testi ve Spec Kit governance geçti. Odaklı backend: 46 geçti, NER modeli yokluğu nedeniyle 1 atlandı ve 1 beklenen başarısızlık kaldı. Gerçek oturumla iki büro/rol erişimi ve kısıtlı erişim reddi doğrulandı. Sentetik Chromium masaüstü/mobil maskeleme, kopyalama, temizleme ve sidebar kontrolleri geçti; görseller incelendi.
- [x] Tam backend/CI sonuçları ve main commit kaydı: GitHub CI 45120054103 başarılı (normal maliyetle 1.168 backend geçti, 1 atlandı, 1 beklenen başarısızlık); 791 frontend geçti. PR #85 main commit b8699b9542ca0db07679e288ea737804eaa41503 olarak birleştirildi; test edilen dal ile dosya ağacı aynı.
- [x] Main kaynaklı değişmez artefakt b8699b9542ca0db07679e288ea737804eaa41503 uygulama kapsamıyla yayımlandı. Stage/canary/activate/verify geçti; public v.0.43, yeni ekran/API kodu, aynı commit’i gösteren health (ok) ve sentetik public masaüstü/mobil akışlar doğrulandı. Geri dönüş kaynağı b60e7e47e65cdfd511f69f3b55e8292f09e3a30a korunuyor.
- Gerçek müşteri verisi/anahtar kullanılmadı; ek müşteri onboarding yapılmadı. Ayrıntılar specs/012-pii-anonymization/verification.md içindedir.

- Yayın sonrası yapılandırma ve şifreli anahtar dosyaları korumalı `/var/backups/casebridge-anonymization-v043-20261123T055238Z` yedeğiyle byte bazında aynı; arşiv bütünlüğü geçti. Gerçek anahtar işlemi, şema değişikliği veya global AI ayarı değişikliği yapılmadı. Public tarayıcı testi tüm API çağrılarını sentetik karşılıklarla yalıttı; canlı müşteri oturumuyla test iddiası yok. Yeni backend imajı ayrıca ağsız/salt okunur sentetik testten geçti.

## Anonimleştirmede dosya yükleme — v.0.44 adayı

- [x] PDF/DOCX/TXT ve diğer uzantılardaki okunabilir UTF-8/BOM UTF-16 metinlerini dosyayı kaydetmeden çıkarma, kaynak metni inceleyip açıkça maskeleme. DOCX tablo/üst-alt bilgi/not metinleri kapsanır; görsel/gömülü içerik uyarılır.
- [x] 5 MB dosya, 30.000 karakter, 100 PDF sayfası, 16 MB açılmış DOCX/512 öğe sınırları; şifreli/bozuk/taranmış/ikili dosyada sabit ve açıklayıcı hata, sessiz kırpma yok. Dosya seçme/düzenleme/temizleme eski yanıtları geçersiz kılar. Ayrı yerel okuyucu işlemi 15 saniye, Linux’ta 512 MiB/10 CPU saniyesiyle sınırlıdır; anahtar ortamı aktarılmaz.
- [x] Son kaynakta 17 odaklı extraction testi, sentetik düşük parola maliyetli 1.185 backend testi (1 atlama/1 beklenen başarısızlık), 795 frontend ve son düğme değişikliğinde 7 ilgili test geçti. Production build/type/version ve sentetik gerçek PDF/TXT/DOCX/diğer uzantı/taranmış/ikili masaüstü-mobil Chromium akışları geçti; görseller incelendi.
- [x] Normal maliyetli GitHub CI 45123304886 geçti: 1.185 backend (1 atlama/1 beklenen başarısızlık), frontend/build/type/version ve yönetişim. PR #87 main e8f691c04f01bfdb1b963fd42de6b30de281d154 olarak birleşti; backend/frontend/deployment kaynakları test edilen dalla aynı. Değişmez yayın doğrulaması aşağıdaki maddede ayrıca kaydedilir.
- [x] e8f691c04f01bfdb1b963fd42de6b30de281d154 app kapsamıyla stage/canary/activate/verify üzerinden yayımlandı. Public v.0.44/kod/health ve gerçek dosya seçiciyle sentetik public masaüstü/mobil akışları geçti. Önce yeni imaj ağsız/salt okunur gerçek PDF/TXT/DOCX/diğer metin testinden geçti; public oturumsuz API 401 döndü. Üç korumalı yapılandırma/şifreli anahtar dosyası `/var/backups/casebridge-anonymization-v044-20261123T062056Z` yedeğiyle byte bazında aynı. Geri dönüş kaynağı b8699b9542ca0db07679e288ea737804eaa41503 korunuyor. Public tarayıcıdaki tüm API çağrıları sentetik olarak yalıtıldı; gerçek müşteri oturumu veya yeni tam kurtarma provası iddiası yok.
- Gerçek müşteri verisi/anahtar, ek müşteri onboarding, global AI ayarı veya şema değişikliği yok. Ayrıntılı kabul kaydı specs/012-pii-anonymization/verification.md içindedir.

## Gece Atlası tanıtım sitesi — v.0.51, 23 Kasım 2026

- [x] Dört değer tek kurgusal dosyada: geçmiş belge/kritik bulgu, koşullu iki dal, dala bağlı prova/geri bildirim, büro-avukat portföy/görev/ajanda. Gerçek WebGL derinliği, doğal kaydırma, azaltılmış hareket ve statik fallback; gerçek Demo randevu bağlantısı.
- [x] 25 betik ve 3 model testi; beş genişlikte gerçek Chromium akışları ve görsel inceleme geçti. Taste gate OPEN60; brief ile uyuşmayan kit/tam-ekran ölçütleri açık kaydedildi. Performans 0 hata/2 yinelenen logo uyarısı. Klavyede harf ile yerel seçim ve Tab geçti; ok tuşuyla OS pencere otomasyonu sınırı açıklandı. Ayrıntılar specs/015-night-atlas/verification.md.
- [x] PR89 → main 7c9a7af9c74b45ea2009e0b23acc3c4ad41dedd6; CI 45137707329 başarılı: 1.185 backend (1 atlama/1 beklenen başarısızlık), 795 frontend/build/type/version ve governance. Marketing-only stage/canary/activate/verify geçti. Public v.0.51/kod, 20 dosya hash’i ve beş genişlikte gerçek WebGL/kurgu akışları doğrulandı. Uygulama e8f691c/v.0.44 ve tüm yedi container kimliği aynı; health ok. Önceki v.0.50 artefaktı korundu, yeni üretim rollback provası iddiası yok. Kanıt docs/validation/2026-11-23/night-atlas-*. Yeni müşteri onboarding veya anahtar işlemi yok.

## Örnek olasılık haritası · tanıtım v.0.52

- [x] Geri alınan v.0.50 ana sayfasında iki giriş, perspektif karar ağacı, değiştirilebilir koşullu dağılımlar, ağırlıklı sonuçlar, üç okunabilir belge ve açık yapay zekâ/kurgu etiketi. Yerel 24 betik testi, 21 yayın testi ve 1440/390/320 px tarayıcı akışları geçti.
- [x] PR #91, main 09c80cb: yalnız tanıtım kapsamıyla v.0.52 yayımlandı. Canlı kaynak eşleşmesi, üç genişlikte harita/belge akışları ve uygulama sağlık kontrolü geçti.
