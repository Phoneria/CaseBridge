# Behavior Contract

All FR in ../spec.md are normative.

NavigationItem.href: existing AI_ROUTES values plus accepted scenario tree; visible iff authenticated non-platform, non-restricted session; active uses exact route or slash boundary.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.
