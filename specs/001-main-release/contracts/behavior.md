# Behavior Contract

All FR in ../spec.md are normative.

Release.commit: 40 lowercase hex; Release.scope: app|marketing|all; Release.state: staged|verified|rolled_back; file digests: SHA-256; release paths restricted to fixed inventory, never caller paths.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.
