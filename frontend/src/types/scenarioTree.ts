export interface ScenarioSource {
  id: string;
  kind: 'case' | 'event' | 'document' | 'analysis' | 'assumption';
  label: string;
  detail: string;
  recorded_at: string | null;
}
export interface ScenarioNode {
  id: string;
  parent_id: string | null;
  kind: 'context' | 'development' | 'outcome' | 'scenario';
  label: string;
  description: string;
  reasoning: string;
  source_ids: string[];
  uncertainties: string[];
  probability: number | null;
  transition_percent?: number | null;
  path_percent?: number | null;
  recorded_step?: boolean;
  illustrative?: boolean;
  support_weight?: number | null;
  probability_group_id?: string | null;
  assessment_label: 'Hesaplanmadı' | 'Demo tahmini';
}
export interface ScenarioTree {
  case_id: string;
  title: string;
  case_closed: boolean;
  context_version: string;
  generated_at: string;
  source_mode: 'stored_analysis' | 'conditional_preparation' | 'synthetic_demo' | 'dossier_history';
  analysis_id: string | null;
  analysis_created_at: string | null;
  is_example: boolean;
  demo?: { method: string; missing_reason: string | null; assumptions: {id: string; label: string; value: string; value_label: string; explanation: string}[]; groups: {question: string; definition: string; total_points: number; weights: {node_id: string; score: number; percentage_tenths: number}[]}[] } | null;
  support_model?: {method: string; assumptions: {node_id: string; value: SupportAssumption; linked_records: number; delta: number; explanation: string}[]} | null;
  nodes: ScenarioNode[];
  sources: ScenarioSource[];
  current_facts: string[];
  uncertainties: string[];
  truncated: boolean;
  limits_note: string;
  disclaimer: string;
}

export type SupportAssumption = 'neutral' | 'supports' | 'contradicts';
export type DocumentAssumption = 'unreviewed' | 'supports' | 'contradicts' | 'missing';
export type PaymentAssumption = 'unknown' | 'supports' | 'contradicts' | 'missing';
