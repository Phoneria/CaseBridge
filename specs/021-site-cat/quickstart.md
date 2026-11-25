# Quickstart
cd backend && python -m pytest tests/api/test_site_chat.py -q
node --test tests/e2e/marketing/site-cat-model.test.mjs && python3 -m unittest scripts.tests.test_site_cat -v
cd web-page && python3 -m http.server 8091 --bind 127.0.0.1   # then, in tests/e2e: node marketing/site-cat-browser.cjs
