# Behavior Contract

All FR in ../spec.md are normative.

Release.commit: 40 lowercase hex; Release.scope: app|marketing|all; Release.state: staged|verified|rolled_back; file digests: SHA-256; release paths restricted to fixed inventory, never caller paths.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.

Main ruleset and CI follow-up: `specs/changes/*.json` version 1 records cover every behavior path from git diff base...head. Require existing FR anchors, changed named tests with assertions, then execute bound tests in required spec-governance. Documentation-only changes pass without records. No arbitrary test commands. Required context is provider-bound to GitHub Actions 15368, PR zero required approvals, no bypass/force push.
