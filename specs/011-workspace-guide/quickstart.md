# Validation

Run the WorkspaceGuide, WorkspaceHeader and AppShell component tests from frontend, then run the production build. Verify the version with `node frontend/scripts/update-version.mjs --check` from the repository root.

Start the built frontend on port 3015 with the API URL set to http://localhost:8000. Run `node tests/e2e/guide-check.cjs`. GUIDE_ORIGIN and GUIDE_OUTPUT override the frontend address and local proof directory. The browser uses synthetic sessions and intercepts the API. It checks the header link, contextual handbook, role-filtered topics and real controls as the reader moves forward and backward. It also checks returning to the article, narrow viewports, both themes and zero API writes.

From the repository root run `python3 scripts/check-specs.py` and run the bound acceptance selectors for the change. Record real results in verification.md.
