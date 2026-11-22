# Data Model: S02 Main kaynaklı değişmez yayın

## FeatureContract

Release.commit: 40 lowercase hex; Release.scope: app|marketing|all; Release.state: staged|verified (rollback is recorded separately as operation=rollback); file digests: SHA-256; release paths restricted to fixed inventory, never caller paths.

ChangeContract.version=1; changes[].files are exact changed paths, requirements[] are existing specs/NNN-name/spec.md#FR-NNN identifiers, acceptance_tests[] are changed test path::named assertion selectors; reason is required. Known runners only, no shell commands in records. PR base/head are full Git SHAs. Doc-only diff needs no record. CI evaluates base...head and runs only bound acceptance selectors; dependencies installed only for used runners. Ruleset main active, no bypass, PR minimum reviews zero, non-fast-forward blocked, spec-governance integration_id=15368.
