# Implementation Plan: S08 Daha görünür özgün video

## Summary

Ziyaretçi mevcut video ve tema korunurken daha belirgin arka plan görür.

## Technical Context

Existing Next.js 14/React 18/TypeScript/Tailwind and FastAPI/SQLAlchemy architecture. No unrelated feature or provider/credential change.
Decision: Reduce veil with stronger opacity retained behind left text and weaker right video; compare same video times, preserve all other style/layout values.

## Constitution Check

PASS before design: source traceability, tenant isolation, no secrets, honest probabilities, accessibility, main-only artifacts and rollback. PASS after design: same constraints retained; dangerous access removal is excluded and would require review.

## Project Structure

### Documentation (this feature)

spec.md, research.md, data-model.md, contracts/behavior.md, quickstart.md, tasks.md, verification.md.

### Source Code (repository root)

- `web-page/hero-video-restoration.css`
- `web-page/index.html`

## Complexity Tracking

Reuse existing architecture; no new service or database migration. New behavior is bounded by FR and tested with synthetic data.
