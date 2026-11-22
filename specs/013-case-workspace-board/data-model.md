# Data model
## FeatureContract
- FeatureContract.stage: backlog, todo, in_progress, in_review or done. Older pending tasks start in todo and completed tasks in done. Completed is kept in sync for calendar, reports and legacy writes.
- FeatureContract.priority: low, normal, high or urgent. Existing tasks default to normal.
- Task notes use the existing description. Due dates and assignee retain their existing nullable contract.
- Report preview contains strings from the exact exported CSV; the first row contains column headings.
- CasePrecedentLink is a unique (case, precedent) association in one bureau. Removal deletes the association only. Archived cases are read-only.
