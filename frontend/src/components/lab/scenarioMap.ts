import { addCaseDecisions } from './caseDecisions';
import { CASE_OUTCOME_LABELS, formatDate } from '@/lib/labels';
import type { Case } from '@/types';
import type { ScenarioNode, ScenarioTree } from '@/types/scenarioTree';

function stableHash(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return (hash ^ (hash >>> 13)) >>> 0;
}

function assignTransitions(caseId: string, siblings: ScenarioNode[]) {
  let remaining = 10000; // hundredths of one percent
  const missing = [];
  for (const node of siblings) {
    if (node.transition_percent == null && node.probability != null)
      node.transition_percent = node.probability * 100;
    if (node.transition_percent == null) {
      missing.push({node, seed: stableHash([caseId, node.parent_id, node.id].join('|'))});
    } else remaining -= Math.round(node.transition_percent * 100);
  }
  missing.sort((a, b) => a.seed - b.seed || a.node.id.localeCompare(b.node.id));
  const weights = missing.map((item, rank) => 20 * (rank + 1) + item.seed % 18);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cumulative = 0, assigned = 0;
  missing.forEach(({node}, index) => {
    cumulative += weights[index];
    const through = Math.round(Math.max(0, remaining) * cumulative / total);
    node.transition_percent = (through - assigned) / 100;
    node.illustrative = true;
    assigned = through;
  });
}

// These percentages describe one simulated choice of next step. Independent
// evidence scores can overlap and must never be used as probability weights.
export function scenarioMap(snapshot: ScenarioTree, caseFile?: Case): ScenarioTree {
  const nodes = snapshot.nodes.map(node => ({...node}));
  const root = nodes.find(node => !node.parent_id);
  if (!root) return snapshot;
  root.path_percent = 100;
  const file = caseFile?.id === snapshot.case_id ? caseFile : undefined;
  if (snapshot.source_mode !== 'dossier_history') addCaseDecisions(nodes, snapshot, file);
  const children = new Map<string, ScenarioNode[]>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node);
    children.set(node.parent_id, siblings);
  }
  function assign(parent: ScenarioNode) {
    const siblings = children.get(parent.id) ?? [];
    assignTransitions(snapshot.case_id, siblings);
    for (const node of siblings) {
      node.path_percent ??= parent.path_percent! * node.transition_percent! / 100;
      assign(node);
    }
  }
  assign(root);
  const outcome = file?.outcome && file.outcome !== 'ongoing' ? CASE_OUTCOME_LABELS[file.outcome] : undefined;
  if (snapshot.case_closed && snapshot.source_mode !== 'dossier_history') {
    const events = snapshot.sources.filter(source => source.kind === 'event' && source.recorded_at &&
      (!file?.decision_date || source.recorded_at.slice(0, 10) <= file.decision_date))
      .sort((a, b) => a.recorded_at!.localeCompare(b.recorded_at!));
    const history: ScenarioNode[] = [];
    function append(id: string, label: string, detail: string, sourceId: string) {
      history.push({id, parent_id: history.at(-1)?.id ?? root!.id, kind: 'development',
        label, description: detail, reasoning: 'Bu adım dosya kaydında yer alıyor.',
        recorded_step: true, source_ids: [sourceId], uncertainties: [], probability: null,
        assessment_label: 'Hesaplanmadı'});
    }
    const available = 100 - nodes.length - 1;
    const summarized = events.length > available ? events.slice(0, events.length - available + 1) : [];
    if (summarized.length) {
      append('history:summary', summarized.length + ' önceki gelişme', summarized.map(e => e.label).join(' · '), summarized[0].id);
      history[0].source_ids = summarized.map(e => e.id);
    }
    for (const event of events.slice(summarized.length)) append('history:' + event.id, event.label, event.detail, event.id);
    append('history:closure', outcome ? 'Dosya sonucu · ' + outcome : 'Dosya kapandı',
      [file?.decision_date && formatDate(file.decision_date), file?.closing_note?.trim() ||
        (outcome ? outcome : 'Kapanış sonucu belirtilmemiş.')].filter(Boolean).join(' · '), 'case');
    history[history.length - 1].kind = 'outcome';
    // Recorded history is a separate lane independent of all hypothetical forks.
    nodes.splice(nodes.indexOf(root) + 1, 0, ...history);
  }
  return {...snapshot, nodes};
}
