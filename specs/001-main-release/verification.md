# Verification: 001-main-release

## Local results — 2026-11-22

12 release boundary/recovery unit tests; strict SHA/main/image/file digest rejection, live drift stop, frontend-only backend preservation, old-artifact recovery. Installer dry-run and Python compile passed.

## Outstanding acceptance / release

VPS bootstrap, actual isolated old/new/old canary, normal-user write probes and public commit/hash verification pending.

## Evidence

- `docs/validation/2026-11-22/browser.json`
- `docs/validation/2026-11-22/product-captures.json`
- `docs/validation/2026-11-22/contrast.json`
- `todo.md` current release record (public proof appended only after verification).

## Convergence

Preimplementation spec/plan/task consistency checked. Actual implementation traced against each FR; unfinished external/public checks remain open. No unchecked requirement is treated as satisfied by generated documents.

First stage rejected invalid Compose dependency indentation after successful image builds/canaries; no application activation occurred. Corrected base YAML now passes real Docker Compose with synthetic configuration. Added no-secret CI validation and base config validation before build; merged runtime configuration remains a separate gate.

Merged-config verification caught duplicate security_opt lists across base/overlay. New-source overlays now inherit base security lists; legacy rollback overlays still add hardening explicitly. Real Docker Compose base+runtime merge passed with synthetic configuration; 12 release regression tests passed again. No live activation took place during these failed gates.

Nonroot canary caught EACCES on /app/public/sufle: tar safe extraction omits directory modes, so inherited private umask 077 produced 0700 build inputs. Clean Git exports now normalize directory/file read permissions; the entrypoint fixes its own umask. A regression under umask 077 verifies 0755 directories/0644 assets; 13 release tests passed. Failed candidate was not activated.
