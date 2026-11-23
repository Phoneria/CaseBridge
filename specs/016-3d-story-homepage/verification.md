# Verification — 23 Nov 2026
- Local Chrome (Playwright, SwiftShader WebGL) at 1440×900 and 390×844: all six scenes rendered, no console errors (only driver ReadPixels performance notices from screenshotting), no horizontal overflow, ~60 fps in the headless loop.
- Tree moves (expert + precedent) changed outcomes from %26/%32/%27/%15 to %40/%30/%15/%15 in both views.
- `python3 -m unittest discover -s scripts/tests` and `-s deployment/tests`: all passed; `python3 scripts/check-specs.py` passed.
- Release: PR #95 merged as 2c80d079f0df51bc2c6ad45d135d68d5f16979bb. The automatic UI lane skipped it: its journal baseline (b8038f9c) predates manual split app/marketing releases, so the diff from the baseline also contained unshipped backend changes and classified as standard (silent return).
- Published by the operator through the standard entrypoint: `casebridge-release stage 2c80d07… marketing` (canary passed) → `activate` (verified) → `verify` (verified, health ok). current.json: marketing_commit 2c80d07…, application_commit e8f691c… (unchanged).
- Public: /website-version.json v.0.54; homepage references story3d.js?v=0.54; app /release.json 0.44 / e8f691c… unchanged; /api/health ok.
- Follow-up: auto-UI baseline remains b8038f9c; marketing-only merges keep being skipped until a verified all-scope release advances it. Do not hand-set the baseline to 2c80d07 while backend changes between e8f691c and 2c80d07 are unshipped.
