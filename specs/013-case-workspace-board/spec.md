# Case workspace and project board
## User Scenarios
1. From Davalar open a closed or active case, inspect its documents, relevant decisions and interactive scenario tree.
2. Move a task through the team's five stages, record notes, responsibility, urgency and due date, then reload.
3. Load fictional decisions and verify category rates against stored results. Inspect an export before downloading.
### Functional Requirements
- **FR-001**: Remove global document and precedent sidebar links. Offer same-bureau, same-law-category precedents within the selected case, distinguish saved links, allow managers to link/unlink a decision across categories, and retain the case documents tab.
- **FR-002**: Provide a case-bound tree tab and explicit recorded outcome for closed cases in list and detail, including a missing-record state that lets authorized users complete an old decision without reopening the case.
- **FR-003**: Persist five Turkish board stages, editable notes, assignment, due date and priority. Support drag/drop and a keyboard or touch alternative. Preserve task reminders, open counts and completion timestamps.
- **FR-004**: Populate varied sample wins and losses from actual persisted fictional case decisions. Preserve user edits on reimport and support removal.
- **FR-005**: Preview every downloadable report with the same columns, values, ordering and tenant access as its CSV, without logging a download for viewing.
## Success Criteria
All five stages survive reload. Moving to Done updates ordinary task completion. Each seeded category contains wins and losses, and repeated imports preserve outcomes. Every report has a readable preview including header-only data. Foreign case identifiers cannot reveal decisions.
