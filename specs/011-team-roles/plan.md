# Implementation Plan: Ekip rolleri

## Summary
Mevcut statik Türkçe ekip listesine Emin eklenir, İzzet/Bengü rol ve kısa metinleri düzeltilir. Yalnız marketing HTML ve sürüm manifesti değişir.
## Technical Context
Mevcut statik HTML/CSS/JS, dört team-person article. Çalışan index script listesinde legacy team-profiles/i18n yok; eski profiller runtime dependency closure'da kullanılmıyor. Yapılandırılmış ekip metası yok; genel description ekip iddiası içermez. Bu nedenle dormant profilleri/çeviri sözlüklerini değiştirmek gerekmez.
## Constitution Check
PASS: kullanıcı kapsamı, CV gizliliği, mevcut üyeler/tema/erişilebilirlik, ayrı sürüm, protected main ve gerçek public doğrulama. Yeni backend/frontend/yetki/anahtar işlemi yok. Spec/plan/task/model tutarlı; bilinmeyen veya ek araştırma gerektiren teknoloji seçimi yok.
## Project Structure
web-page/index.html; web-page/website-version.json; scripts/tests/test_team_roles.py; specs/011-team-roles/; specs/changes/team-roles.json; todo.md.
## Validation and Release
Bir anlamlı metin/üye/rol/gizlilik kabul testi mandatory governance için. Mevcut marketing varsayılan testleri; JS açık/kapalı 1440/390/320 tarayıcı görsel denetim. PR yalnız bu içerik; required spec-governance ardından mevcut timer marketing scope. Public release.json, HTML hash ve ekip metni, app health doğrulaması. Aktif galeri otomasyonu sonraki marketing sürümünde aynı ekip metnini korur.

## Approved portrait follow-up (FR-005)
User supplied the approved square portrait. Use a 720×720 optimized JPEG derived with Pillow LANCZOS resize, matching existing web portrait widths; no AI generation, retouching or compositing. Existing .member-photo object-fit:cover/object-position and 140×148 desktop /120×126 mobile frame determine the slight displayed crop. Replace only Emin monogram with img alt="Emin Merden", same loading/dimensions pattern as peers. Three runtime paths: index, version manifest, new assets/team/emin-merden-web.jpg. Other cards/text byte-preserved. Governance requires updating the existing team contract to assert img source/alt/dimensions instead of obsolete initials. Local/public image hash and desktop/mobile screenshot inspection; protected marketing-only timer release.
