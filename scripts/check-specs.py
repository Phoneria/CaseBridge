#!/usr/bin/env python3
"""Validate adopted Spec Kit artifacts (behavior diff gate runs alongside this in CI); never treats task completion as test evidence."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []
constitution = (ROOT / '.specify/memory/constitution.md').read_text()
if '[PROJECT_NAME]' in constitution or '**Version**: 1.0.0' not in constitution:
    errors.append('Constitution is missing or still a scaffold')
options = json.loads((ROOT / '.specify/init-options.json').read_text())
if options.get('speckit_version') != '1.4.3' or options.get('integration') != 'codex':
    errors.append('Expected pinned Spec Kit 1.4.3 with Codex integration')
features = sorted((ROOT / 'specs').glob('[0-9][0-9][0-9]-*'))
for feature in features:
    for name in ['spec.md', 'plan.md', 'tasks.md', 'research.md', 'data-model.md', 'quickstart.md', 'verification.md', 'contracts/behavior.md', 'checklists/requirements.md']:
        if not (feature / name).is_file():
            errors.append(f'{feature.name}: missing {name}')
    spec = (feature / 'spec.md').read_text()
    plan = (feature / 'plan.md').read_text()
    tasks = (feature / 'tasks.md').read_text()
    for section in ['## User Scenarios', '### Functional Requirements', '## Success Criteria']:
        if section not in spec:
            errors.append(f'{feature.name}: missing spec section {section}')
    if '[NEEDS CLARIFICATION' in spec + plan:
        errors.append(f'{feature.name}: unresolved material question')
    ids = re.findall(r'^- \[[ x]\] (T\d{3})\b', tasks, re.M)
    if len(ids) < 6 or len(ids) != len(set(ids)):
        errors.append(f'{feature.name}: missing/duplicate task IDs')
    if 'data-model.md#featurecontract' not in tasks or 'FR-001 through FR-' not in tasks:
        errors.append(f'{feature.name}: missing model/requirement task traceability')
if len(features) < 8:
    errors.append('Approved S02–S09 features are not all mapped')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Spec Kit governance: {len(features)} feature contracts/plans/task sets validated')
