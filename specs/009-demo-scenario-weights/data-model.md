# Data Model

## FeatureContract

TreeNode.probability: null or fraction [0,1]; TreeNode.assessment_label: Hesaplanmadı|Demo tahmini. Non-null is permitted ONLY when ScenarioTree.source_mode=synthetic_demo, fixed case/fixture ID, is_example=true, demo metadata and exactly one partition membership. Real tree nodes must have null probability and group ID regardless of is_example.

DemoModel.fixture_id=invoice-evidence-v1; method_version=demo-weights-v1. Assumptions document={unreviewed,supports,contradicts,missing}, payment={unknown,supports,contradicts,missing}. DemoGroup has fixed question, three member node IDs, exclusive/exhaustive true, calculated flag, integer scores and percentage_tenths (sum 1000 only if calculated). A missing source resets all three scores to 1; largest remainders produce 334/333/333 tenths. Real branches additionally expose support_weight and SupportModel inputs, linked record IDs/count, signed delta and explanation; probability remains null. The zero-record override is 50 regardless of assumption. Source count is illustrative sensitivity, not evidence strength or corroboration. Contribution explanations, source IDs and context_version are carried in the response. Snapshots are ephemeral browser memory only.
