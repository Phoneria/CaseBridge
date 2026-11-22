import { CASE_OUTCOME_LABELS, formatDate } from '@/lib/labels';
import type { Case } from '@/types';
import type { ScenarioNode, ScenarioTree } from '@/types/scenarioTree';

// These percentages describe one simulated choice of next step. Independent
// evidence scores can overlap and must never be used as probability weights.
export function scenarioMap(snapshot: ScenarioTree, caseFile?: Case): ScenarioTree {
  const nodes = snapshot.nodes.map(node => ({...node}));
  const root = nodes.find(node => !node.parent_id);
  if (!root) return snapshot;
  root.path_percent = 100;
  const children = new Map<string, ScenarioNode[]>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node);
    children.set(node.parent_id, siblings);
  }
  function assign(parent: ScenarioNode) {
    const siblings = children.get(parent.id) ?? [];
    for (const node of siblings) {
      node.transition_percent ??= node.probability != null ? node.probability * 100 : 100 / siblings.length;
      node.path_percent ??= parent.path_percent! * node.transition_percent / 100;
      assign(node);
    }
  }
  assign(root);
  const file = caseFile?.id === snapshot.case_id ? caseFile : undefined;
  const outcome = file?.outcome && file.outcome !== 'ongoing' ? CASE_OUTCOME_LABELS[file.outcome] : undefined;
  if (snapshot.case_closed && snapshot.source_mode === 'dossier_history' && outcome) {
    const end = nodes.find(node => node.id === 'recorded' && node.recorded_step);
    if (end) end.label = 'Gerçekleşen sonuç · ' + outcome;
  }
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
    for (const event of events) append('history:' + event.id, event.label, event.detail, event.id);
    append('history:closure', outcome ? 'Dosya sonucu · ' + outcome : 'Dosya kapandı',
      [file?.decision_date && formatDate(file.decision_date), file?.closing_note?.trim() ||
        (outcome ? outcome : 'Kapanış sonucu belirtilmemiş.')].filter(Boolean).join(' · '), 'case');
    // Recorded history is a separate lane independent of all hypothetical forks.
    nodes.splice(nodes.indexOf(root) + 1, 0, ...history);
  }
  return {...snapshot, nodes};
}
