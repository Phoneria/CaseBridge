# Behavior Contract

All FR in ../spec.md are normative.

Capture: feature route, source commit/application version, theme, viewport, synthetic dataset, original file path; full-size link equals displayed image.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.

Current product order: existing tab/panel12 first and selected, then 1..11; no duplicate. Tab12 aria-selected=true/tabindex=0 and visible matching panel; all others unselected/hidden. Current image/description/app route retained; keyboard follows DOM order, JS-off default tree works. All twelve native captures now reflect app v.0.22.

Gallery img src and full-size href both use the normal release-bound `?v=0.47` URL; reused conversation/evaluation image references use the same key. Strip query only for filesystem/hash lookup. Validate normal markup URLs and warmed-cache ordinary reload, without a manually appended verification query. An already-open/offline old HTML cannot be remotely replaced; the refreshed release HTML gives distinct image cache keys.
