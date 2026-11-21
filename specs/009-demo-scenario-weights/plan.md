# Implementation Plan: Synthetic scenario weights

## Summary
Use one server-owned invoice/evidence fixture behind a separate authenticated endpoint. Reuse the existing tree renderer and real-case endpoint; do not infer synthetic eligibility from real-case flags.

## Technical Context
Next.js 14/React 18/TypeScript; FastAPI/Pydantic/SQLAlchemy. New calculator is pure Python and never accepts ORM records. Integer scores and percentage-tenths remove floating rounding drift. No dependencies, model/API calls, schema migration, key or access changes.

## Constitution Check
PASS: explicit user-authorized illustrative calculation, labelled noncalibrated weights, real-case tenant/secret boundaries preserved. Main-only immutable artifact, separate v. labels and public verification retained. Professional review of actual legal outputs remains distinct from this technical POC.

## Research and Design
Research compares isolated fixture vs existing example flags; existing mock/demo-template flags cannot prove a real record is synthetic. Use separate fixture mode + fixed ID + schema guards. Method: 1 base point each, document assumption contributes 2, payment matching contributes 1, normalize only one defined partition; required missing source resets the whole partition to equal starting weights. Read research.md and data-model.md before implementation.

## Project Structure
backend/app/legal_lab/scenario_demo.py; scenario_tree.py DTO guards; legal_lab.py endpoint; ScenarioTreeView.tsx and shared types/api; tests; marketing current tree image/FAQ.

## Validation and Release
Pure combinations/rounding, schema/tenant/API negative tests, renderer/stale-response tests, browser sample-to-real switch; appropriate full suites/build/version checks. Increment app v.0.21 and marketing v.0.45 once finalized. Build from pinned main using existing restricted release entrypoint; canary, isolated rollback, public hashes/health and actual public JS with synthetic data. No automatic trigger added.
