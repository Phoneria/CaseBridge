# Implementation Plan: S02 Main kaynaklı değişmez yayın

## Summary

Operatör yalnız main kaynaklı doğrulanmış sürümü etkinleştirir; olağan hesap canlı kodu düzenleyemez.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: Root-owned inventory, origin/main-only clean git archive, image IDs and static hashes; fixed deploy/rollback entrypoint; read-only app rootfs; separate /app/storage; no changes to existing root/izzet administrator access.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `deployment/release.py`
- `deployment/install-release.py`
- `deployment/compose.production.yml`
- `deployment/README.md`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.

Runtime overlays distinguish legacy rollback source from new main Compose: security/tmpfs lists are supplied only for legacy source, while new source already declares them. Actual merged config is validated with synthetic env in CI before deployment; scalars and pinned image/identity remain in the runtime overlay.
