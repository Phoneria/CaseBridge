# Implementation Plan: S04 Emin Bilgi Haritası uyumu

## Summary

Kullanıcı karşılaştırılabilir koşullarda Emin’in mevcut Bilgi Haritasını görür.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: origin/emin 134e881 is ancestor of main; MapView/graphLayout/graph data blobs are identical. Preserve upstream geometry/data; compare same selection/theme and record screenshot/provenance differences, not invent a replacement.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `docs/map-comparison.md`
- `frontend/src/components/lab/MapView.tsx`
- `frontend/src/lib/graphLayout.ts`
- `backend/app/legal_lab/graph.py`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.
