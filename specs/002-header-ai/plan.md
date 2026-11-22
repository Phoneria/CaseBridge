# Implementation Plan: S03 Header yapay zekâ gezinmesi

## Summary

Yetkili kullanıcı AI araçlarına header ve açık tek sütun sidebar grubundan erişir. Son kullanıcı isteği sidebar’ı geri ekler; header korunur.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: Shared AI route metadata, native dialog opened from header for all widths; session-derived role filtering; pathname closes dialog; preserve existing AppShell guards.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `frontend/src/components/AiNavigation.tsx`
- `frontend/src/lib/aiNavigation.ts`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/WorkspaceHeader.tsx`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.

## CI regression resolution

CI exposed an existing passive-effect/recording closure race: a fast recording could capture initial `opening` before conversation default became `argument`. Resolve the effective action at submit boundary from the session mode and permitted conversation actions; retain evidence/rebuttal/objection choices. No voice/provider API or tenant change. Existing microphone regression plus full suite verify this.

## Final sidebar follow-up

Shared metadata remains the source for both menus. Compact 24px rows and 13px labels plus smaller logo/spacing meet measured 900/768px full-menu visibility; min-h-0/overflow preserve short/mobile reachability. No group disclosure or bright outline. App v.0.22 / site v.0.46 public verification complete; see verification.md.
