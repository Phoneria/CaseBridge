# Acceptance Quickstart

Use synthetic data and the pinned source.

1. Reject non-main source and path/manifest tampering without changing active services.
2. Demonstrate denied code writes for ordinary account/runtime, retained admin access and successful verified rollback.
3. Record actual commands/results in verification.md; for publication verify main commit, public code/version/health and rollback.

For behavior PRs add a specs/changes/<name>.json record with version=1, changes[].files/requirements/acceptance_tests/reason. Use exact changed paths and existing Spec Kit FR anchors. Tests must be changed in this PR and have a named assertion. Run `python3 scripts/check-spec-changes.py --base FULL_BASE_SHA --head FULL_HEAD_SHA --run`; CI does the same. No record required for docs-only changes. All own changes use PR after protection activation; do not bypass or merge probe branches.
