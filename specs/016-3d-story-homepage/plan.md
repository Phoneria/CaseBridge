# Plan
- Static, buildless page stays: `web-page/index.html`, `story3d.css`, `story3d.js`.
- `story3d.js` is an esbuild bundle (ESM, minified) of `source/story3d.src.js` with three@0.187.0, so no sibling imports exist (the release copier follows only HTML/CSS references). Self-hosted Manrope from `assets/night-atlas/`.
- Scenes are procedural (no model files): case file → network; rewind rail + amber alternative tube; cylinder tree with path-probability radii; shader masking a canvas-drawn petition; stacked bars on a polar floor with deadline rings; animated waveform + card planes.
- Camera distance is fitted per scene to the visible viewport area (right side on desktop, top on mobile).
- Change set qualifies for the automatic marketing UI lane (web-page html/css/js/json version, specs, scripts/tests only).
