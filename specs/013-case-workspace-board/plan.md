# Implementation plan
Use existing CaseDetailView, ScenarioTreeView, PrecedentsView and the scoped case query. A category match is explicitly labelled as such. Keep the old standalone routes for existing links. Store task planning metadata using an additive Alembic migration and the existing case task mutation API. Keep the existing pending/completed contract for other screens. Use the same report generators for tabular previews. Extend only the on-demand fictional portfolio, including its removal catalogue.
## Constitution check
Preserve tenant boundaries, restricted roles, archived read-only cases and source evidence in the scenario tree. No changes to credentials, deployment or administrator access.
