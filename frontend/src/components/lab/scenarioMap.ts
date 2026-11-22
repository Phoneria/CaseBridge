import { CASE_OUTCOME_LABELS, formatDate } from '@/lib/labels';
import type { Case } from '@/types';
import type { ScenarioNode, ScenarioTree } from '@/types/scenarioTree';

// A short tree gains review decisions, never fabricated events in the case history.
// Each review joins an existing branch and inherits its links to the case records.
const reviews = [
  ['Olay sırasını incele', 'Tarihlerin uyuşması halinde kronolojiyi doğrula', 'Tarihler çelişirse açıklama iste'],
  ['Belgenin kaynağını incele', 'Asıl nüsha varsa dayanakla eşleştir', 'Asıl nüsha eksikse temin yolunu belirle'],
  ['Taraf beyanlarını karşılaştır', 'Ortak anlatımları dosyada işaretle', 'Çelişen anlatımlar için soru hazırla'],
  ['Talebin kapsamını kontrol et', 'Talep açıksa ilgili delilleri sırala', 'Talep belirsizse müvekkilden ayrıntı iste'],
  ['Tebliğ kaydını incele', 'Teslim kaydı varsa tarihini karşılaştır', 'Teslim belirsizse tebliğ evrakını incele'],
  ['Uzman görüşü ihtiyacını değerlendir', 'Teknik uyuşmazlık varsa inceleme sorularını yaz', 'Mevcut rapor yeterliyse dayanaklarını özetle'],
  ['İzlenecek işlemi değerlendir', 'Yeni bulgu varsa çalışma planını güncelle', 'Kayıtlar yeterliyse değerlendirmeyi tamamla'],
];

function extendShortTree(nodes: ScenarioNode[]) {
  const parents = new Set(nodes.map(node => node.parent_id));
  const leaves = nodes.filter(node => !parents.has(node.id));
  for (let i = 0; i < reviews.length && nodes.length < 20; i++) {
    const leaf = leaves[i % leaves.length];
    const [review, first, second] = reviews[i];
    const id = 'review:' + leaf.id + ':' + i;
    const step = {description: 'Bu dalda incelenebilecek konu: ' + review + '.',
      reasoning: 'Bu inceleme, “' + leaf.label + '” dalı için olası bir hazırlık adımıdır.',
      source_ids: leaf.source_ids, uncertainties: leaf.uncertainties, probability: null,
      assessment_label: 'Hesaplanmadı' as const};
    nodes.push({ ...step, id, parent_id: leaf.id, kind: 'development', label: review });
    for (const [index, label] of [first, second].entries()) {
      nodes.push({...step, id: id + ':' + index, parent_id: id, kind: 'outcome', label,
        description: label + '. Bu koşulun dosyada karşılanıp karşılanmadığı dayanaklarla incelenir.'});
    }
  }
}

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
  extendShortTree(nodes);
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
