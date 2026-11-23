# Verification — 23 Nov 2026
- Local Chrome (Playwright, SwiftShader WebGL) at 1440×900 and 390×844: all six scenes rendered, no console errors (only driver ReadPixels performance notices from screenshotting), no horizontal overflow, ~60 fps in the headless loop.
- Tree moves (expert + precedent) changed outcomes from %26/%32/%27/%15 to %40/%30/%15/%15 in both views.
- `python3 -m unittest discover -s scripts/tests` and `-s deployment/tests`: all passed; `python3 scripts/check-specs.py` passed.
- Public verification after merge: pending (T007).
