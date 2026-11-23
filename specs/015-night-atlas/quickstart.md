# Quickstart
Serve web-page/ using a static server; no installation or app API needed. Run the pure model acceptance and scripts/check-specs.py. Browser QA uses existing Playwright installation with synthetic marketing data only. No app/customer API should be called. Before publishing, review todo.md, required CI, main SHA and marketing v. manifest; use the existing restricted marketing release path and record public validation.

From the repository root, with tests/e2e Playwright dependencies installed:

```sh
python3 -m http.server 3195 --bind 127.0.0.1 --directory web-page
node --test tests/e2e/marketing/night-atlas-model.test.mjs
node tests/e2e/marketing/night-atlas-browser.cjs http://127.0.0.1:3195
node tests/e2e/marketing/night-atlas-keyboard.cjs http://127.0.0.1:3195
node tests/e2e/marketing/night-atlas-motion.cjs http://127.0.0.1:3195
node tests/e2e/marketing/night-atlas-touch.cjs http://127.0.0.1:3195
```

Run the server in another terminal. Keyboard QA opens the real calendar in a new page; it does not submit an appointment. Other interactions and workload state are explicitly fictional and in memory.
