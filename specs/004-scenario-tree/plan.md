# Implementation Plan: S05 Dosyaya özgü olasılık ağacı

## Summary

Kullanıcı kendi dosyasının olayları, alternatif gelişmeleri, dayanakları ve belirsizliklerini dallanan görünümde inceler.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: GET scoped tree derived from Case + explicitly firm-scoped CaseEvent/Document + latest completed SIMULATION_REPORT. No provider call or migration. Stored scenarios remain verbatim; no index-based causal pairing. Fallback conditional preparation paths are labelled, not predictions. Hash used content including document text for refresh detection.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `backend/app/legal_lab/scenario_tree.py`
- `backend/app/api/routes/legal_lab.py`
- `frontend/src/components/lab/ScenarioTreeView.tsx`
- `frontend/src/types/scenarioTree.ts`
- `frontend/src/app/ai/olasilik/page.tsx`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.
