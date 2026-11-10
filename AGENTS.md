# Repository release requirements

- Read `todo.md` before pushing changes or preparing a release.
- The user requires separate encrypted AI API credentials for each law firm (option 2) before any additional customer delivery or onboarding. Do not deploy or describe an update as ready for another customer until all mandatory customer-release items in `todo.md` are verified and complete.
- The currently authorized interim workflow is option 1: add and test a candidate key separately, then activate explicitly while retaining the previous key. Saving a candidate must not replace the active key.
- Never commit, log, return or persist in browser storage any real API key or encryption key.
- Keep the `v.` version-label format and increment the released version when application behavior changes. Record actual validation results; leave incomplete checklist items unchecked.
