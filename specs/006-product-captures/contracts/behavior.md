# Behavior Contract

All FR in ../spec.md are normative.

Capture: feature route, source commit/application version, theme, viewport, synthetic dataset, original file path; full-size link equals displayed image.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.

Current product order: existing tab/panel12 first and selected, then 1..11; no duplicate. Tab12 aria-selected=true/tabindex=0 and visible matching panel; all others unselected/hidden. Current image/description/app route retained; keyboard follows DOM order, JS-off default tree works. All twelve native captures now reflect app v.0.22.
