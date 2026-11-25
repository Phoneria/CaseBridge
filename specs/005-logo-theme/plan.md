# Implementation Plan: S06 Tema bağımsız logo kimliği

## Summary

Kullanıcı tema değişiminde aynı CaseBridge logo kimliğini görür.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: Use existing supplied light logo artwork on a stable white-backed logo surface; remove CSS content swap to different dark wordmark. Preserve identity, no new logo design.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `frontend/src/components/BrandLogo.tsx`
- `frontend/src/app/theme.css`
- `frontend/public/casebridge-logo.png`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.
