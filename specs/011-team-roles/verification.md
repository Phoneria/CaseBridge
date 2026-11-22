# Verification
2026-11-22: CV tek sayfa tam metin ve render incelendi. Çalışan ekip görünümü index.html; legacy profil/i18n/team-profiles dosyaları yüklenen dependency closure'da değil. Yeni sorumluluklar kullanıcı talebinden; kısa mesleki özet CV'den. Gereksinim/plan/görev tutarlılığı: 4 FR kapsandı, 6 görev, 0 kritik/uyumsuz alan; model alanları T003'e bağlı. Sonuçlar aşağıdaki gerçek yerel/public kanıtta.

Local acceptance: four targeted unittest checks passed (one team responsibility/privacy contract, three existing gallery/version checks). Spec Kit validates eleven feature contracts. Six real Chromium views at 1440/390/320 with JS on/off passed exact five names/roles, member image decoding/alt, decorative monogram, no private-contact/PDF/investment text in team, no overflow/page errors/bad assets. Desktop/mobile screenshots visually inspected. Mobile menu to #team works with JS; direct #team works without JS.

Initial browser instrument used networkidle and was stopped when the video request kept navigation pending; final checks use DOMContentLoaded plus concrete image/UI assertions. This was a validation-wait adjustment, no product fix. The local PDF Poppler wrapper lacked fontconfig and stalled; bundled pdfplumber rendering/extraction was used successfully instead. No CV artifact is tracked.

Only team article content and marketing version49 change. General metadata has no member/role claims; the runtime loads no legacy team/i18n script, so dormant historical source profiles are unchanged. Existing Hatice/Ahmet articles are byte-preserved; gallery references and all twelve JPEGs remain unchanged. Gallery automation may publish a later marketing capture-only version after49 while preserving these team contents. Public release verified below.

## Public release verified — marketing v.0.49

Protected PR #56 (https://github.com/Phoneria/CaseBridge/pull/56) merged main444c5203ede5e9243a77e017fb55a920a294b53f after actual required spec-governance SUCCESS; backend/frontend jobs correctly SKIPPED for marketing scope. Existing VPS timer automatically activated marketing49; no manual stage/activate or live source patch. Restricted immutable verifier reports state=verified, scope=marketing, health=ok; previous48/da78 retained.

Normal https://casebridge.com.tr/#team serves five exact names/roles with source HTML SHA256 eac7afdd82514c77a4d75da45df02945fa5847a66fe74a419719f0953b37ecdf. Release.json is49/444c520. Public six-view JS on/off1440/390/320 checks pass; desktop/mobile screenshot inspection confirms correct layout/readable copy. No custom query/manual cache bust. All four existing portraits decode with alt text; EM monogram is decorative. Mobile menu target and direct JS-disabled #team verified. No private CV/contact or investment copy in team.

Runtime closure has47files; only index.html among four deployed HTML files has team names. Legacy profiles, team-profiles.js and i18n JS are absent from the immutable closure; direct normal /profiles/izzet-ahmet.md returns404. General meta has no stale role assertion. Existing Hatice/Ahmet article bytes and all non-team HTML except version are unchanged.

Public app remains23/f625960cadd4e4c29985fa26fcb4914d4ff326b3. Health status=ok; unchanged backend independently reports21/1b460a691af375da61e18014733ed0ca0c10b1a5. No app/backend release, customer onboarding, schema or credential operation. Standing authorized gallery automation may generate its own later version from49, preserving team text.

Evidence: docs/validation/2026-11-22/team-local-results.json, team-public-results.json, team-release-journal.json. This final evidence-only change adds no runtime/version content and requires no redeployment.

## Approved portrait follow-up — local v.0.50

Approved1254×1254 source SHA2561db5d62f4e51a96f76e7db2ae4796eb4123d1ed7da7d769edc88fa540371c3ae read without modification; Pillow LANCZOS resize only to720×720 optimized RGB JPEG,60741bytes. Output SHA256a251fefe1a5a78923004ce9b996a23514c486fe2e3d54d611262a1489328ce16. No generation, retouching, content/color adjustment or compositing. Existing object-fit cover/50%36% crop rules retained; 140×148 desktop and120×126 mobile frames visually inspected with face/hair preserved.

Updated existing team acceptance and three existing marketing checks passed. Six real Chromium views1440/390/320 with JS on/off pass720×720 image decode, exact image URL/body SHA, Emin Merden alt, unchanged five names/roles, no overflow/errors/bad assets. Screenshots visually inspected. Static comparison confirms all HTML bytes except portrait tag and marketing version are unchanged; all other images untouched. Spec/plan/model/tasks consistency: FR-005 linked T007–T009, TeamMember.portrait cited; requirements checklist5/5 existing quality checks pass. Public follow-up verified below; T009 completed.

## Portrait public release verified — v.0.50

Protected PR58 merged as ebe5f51b18b8d5f8a095e1102a1e921ca01b2b91 after required spec-governance SUCCESS (CI45006401353); frontend/backend SKIPPED for marketing-only change. Existing VPS timer automatically published in15seconds; no manual stage/activate or live source edits. Restricted immutable verifier state=verified/scope=marketing/health=ok. Previous49/444c520 retained.

Normal https://casebridge.com.tr/#team serves the approved Emin portrait at assets/team/emin-merden-web.jpg,720×720, SHA256a251fefe1a5a78923004ce9b996a23514c486fe2e3d54d611262a1489328ce16, exactly the committed web derivative. Normal public HTML SHA2564b8b380cdd6acf8e5579e6c78bdfc81904f94c334147ac43c8930d326b4ab435 equals main source. Release.json50/ebe5f51. Six JS-on/off1440/390/320 public views passed actual img/currentSrc/hash/decode, alt=Emin Merden, object-fit cover and preserved names/roles. Desktop/mobile screenshots visually inspected; face/hair fit current photo frame without obstruction. No manual URL cache-bust.

App remains23/f625960; unchanged backend health reports21/1b460a6/statusok. All card text and unrelated member/source HTML bytes are unchanged except portrait and marketing version. No new customer, app/backend/credential or Rehber change. Evidence: emin-portrait-asset.json, emin-portrait-local-results.json, emin-portrait-public-results.json, emin-portrait-release-journal.json in docs/validation/2026-11-22/. Final record-only change requires no new deployment.
