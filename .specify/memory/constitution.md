# CaseBridge Constitution

## Core Principles

### I. Spec Kit applies to the whole project
All application, marketing, infrastructure and release work MUST have an approved
requirement, implementation plan, dependency-ordered tasks and recorded verification.
Existing open work in todo.md is included. Spec/plan/task consistency MUST be reviewed
before implementation; actual acceptance evidence MUST precede task completion.

### II. Preserve bureau isolation and staged credentials
The authenticated session MUST determine bureau scope. Cross-bureau case, document,
analysis, cache, job and credential access MUST remain denied. Candidate credentials
MUST be tested separately; saving MUST NOT replace an active credential. Activation
MUST remain explicit and retain the previous credential. Customer users MUST NOT
control another bureau's or the platform's key.

### III. Secrets and private data stay outside code
Real API/encryption keys MUST NOT enter Git, logs, responses, screenshots or browser
storage. Production configuration, encrypted credentials and user data MUST remain
outside release artifacts. Demonstrations and marketing captures MUST use synthetic
records and the actual application UI, without reconstructing screenshots.

### IV. Evidence precedes legal predictions
Statutory citation/reversal frequencies and AI assessment scores MUST NOT be presented
as calibrated case-winning probabilities. A scenario tree MUST expose its source,
conditions and missing/contradictory information. Uncomputed probability MUST be null
and labelled uncomputed, never fabricated or silently represented as zero. Outputs
remain decision support requiring a legal professional's review.

### V. Main is the sole release-code source
Each release MUST resolve a specific commit from GitHub main, build a clean immutable
artifact and verify the activated public code against that artifact and commit.
Routine service/deploy users MUST NOT edit live application code. Root emergency
administration is a privileged, auditable exception, not an absolute technical barrier.
Secrets and mutable data MUST be separate. Deployment triggers/frequency MUST NOT be
invented; no user-locking access changes may occur without a concrete review first.

### VI. Preserve product behavior and accessible navigation
Changes MUST preserve existing roles, restricted/platform workspace boundaries, active
navigation and keyboard focus. AI entry points belong in the header, including on
mobile. Logo identity MUST remain consistent across themes. Marketing MUST describe
verified delivered features in Turkish and preserve the existing theme/video.

### VII. Honest versions, validation and rollback
Application and marketing versions MUST remain separate and retain the visible `v.`
prefix. Behavior changes MUST increment their release version. Every release MUST
record relevant tests, public version/code/health verification and a recoverable prior
artifact. A successful build alone MUST NOT be reported as completed deployment.
Incomplete customer-release requirements in todo.md MUST remain open; no additional
customer rollout may be described as ready before those gates are actually satisfied.

## Security and compatibility constraints

Reuse the existing Next.js/React frontend, FastAPI/SQLAlchemy backend and tenant model.
Do not replace existing architecture, erase independent local work, expose production
data in tests or introduce unrelated onboarding work. Preserve the shared VPS's other
services, existing admin recovery access and protected data/credential backups.

## Delivery workflow and quality gates

For each bounded feature: specify user outcomes; resolve material ambiguities; plan
against the repository; produce tasks; analyze consistency; implement; converge using
real checks. Requirements-quality checklists are distinct from implementation tasks.
New authorization/data behavior requires meaningful negative and isolation tests.
Small visual changes use appropriate existing checks and browser inspection, without
mirroring implementation details in unnecessary tests. Publish only accepted changes
through the main-sourced release path; verify and record any material limitation.

## Governance

This constitution operationalizes user instructions and AGENTS.md; it does not weaken
their requirements or add approval gates to routine authorized work. Amendments MUST
state rationale, affected specs and version impact. Initial adoption is version 1.0.0;
subsequent governance changes use semantic versioning. Every review MUST check these
principles and explicitly record any justified exception before release.

**Version**: 1.0.0 | **Ratified**: 2026-11-22 | **Last Amended**: 2026-11-22
