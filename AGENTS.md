# Repository release requirements

- Read `todo.md` before pushing changes or preparing a release.
- The user requires separate encrypted AI API credentials for each law firm (option 2) before any additional customer delivery or onboarding. Do not deploy or describe an update as ready for another customer until all mandatory customer-release items in `todo.md` are verified and complete.
- The user now authorizes bureau administrators to configure their own bureau's key in Settings. Preserve the staged workflow: test a candidate separately, then activate explicitly while retaining the previous key. Saving must not replace the active key. Never grant a customer user control of another bureau's or the platform's key.
- Never commit, log, return or persist in browser storage any real API key or encryption key.
- Keep the `v.` version-label format and increment the released version when application behavior changes. Record actual validation results; leave incomplete checklist items unchecked.
- Before announcing a deployment complete, verify the expected version and updated application code are served by the public site and its health check passes. A running build or deployment is not a completed release.

# Whole-project Spec Kit workflow

- Use the pinned GitHub Spec Kit 1.4.3 Codex skills in `.agents/skills/` for all application, marketing and release work.
- Read `.specify/memory/constitution.md` and the applicable `specs/<feature>/spec.md`, `plan.md`, `tasks.md` before implementation. Set the local `.specify/feature.json` pointer to the active feature; it is per-worktree state.
- Keep requirements, constrained data contracts, implementation tasks and real validation linked. Run `python3 scripts/check-specs.py`; do not mark implementation complete merely because a requirements-quality checklist passed.
- Production code comes only from a verified immutable artifact of a pinned GitHub main commit. Use the reviewed release entrypoint, keep secrets/data external, and verify public version/code/health and rollback. Do not patch live application source.
- Preserve existing administrator recovery access. Removing or narrowing existing administrator access requires a concrete review first; normal release/service accounts must have no general Docker/root access or application-code write permission.
