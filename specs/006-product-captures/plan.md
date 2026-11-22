# Implementation Plan: S07 Güncel gerçek ürün görselleri

## Summary

Ziyaretçi tanıtımda güncel çalışan uygulamanın doğru Türkçe ekranlarını görür.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: Capture actual final source with synthetic isolated backend; use delivered Turkish UI (no preview-only substitutions). Add scenario-tree tab only once implemented and verified. Sync image/link/description and capture metadata.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `web-page/index.html`
- `web-page/assets/feature-screens/tr-current`
- `web-page/assets/feature-screens/tr-current/CAPTURE_NOTES.md`
- `tests/e2e/marketing`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.

## Final tree-first follow-up

Move the existing tab/panel pair without renumbering IDs or changing other relative order; default visibility exists in HTML. Refresh all twelve native captures after sidebar restoration. Targeted markup/version/provenance and actual browser keyboard/default checks; app v.0.22/site v.0.46 public release verified. See verification.md.

## Public v.0.23 gallery refresh

Read actual app/site release markers and health first. Reuse capture-product.cjs with public app origin and a browser-wide /api proxy to the existing isolated synthetic/mock backend. No real production session or customer data, no application/backend/VPS-source changes. Freeze capture identity before/after, retain raw JPEGs and per-tab hashes/route/viewport/brand/sidebar metadata. Preserve tree-first order/default and image dialog behavior. Increment marketing only to v.0.47, bind images/version to named acceptance checks, use protected PR and existing automatic marketing release. Verify all 12 public bytes, 1440/390/320px gallery/dialog/keyboard and direct health/version.

Gallery img src and full-size href both use the normal release-bound `?v=0.47` URL; reused conversation/evaluation image references use the same key. Strip query only for filesystem/hash lookup. Validate normal markup URLs and warmed-cache ordinary reload, without a manually appended verification query. An already-open/offline old HTML cannot be remotely replaced; the refreshed release HTML gives distinct image cache keys.
