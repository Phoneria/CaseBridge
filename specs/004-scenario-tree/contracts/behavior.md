# Behavior Contract

All FR in ../spec.md are normative.

TreeNode.id unique stable string; kind: context|development|outcome|scenario; probability: null only; source_ids resolve within response; bounded labels <=4000 chars; node/source lists bounded and truncation disclosed. ScenarioTree.context_version SHA-256; case_id session-scoped; no storage_path or browser persistence.

Errors must preserve state; tenant scope comes from the session. Sensitive records must never enter logs, screenshots or browser persistence. See data-model.md FeatureContract for constraints.
