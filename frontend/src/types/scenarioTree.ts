export interface ScenarioSource {
  id: string;
  kind: 'case' | 'event' | 'document' | 'analysis';
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
  probability: null;
  assessment_label: 'Hesaplanmadı';
}
export interface ScenarioTree {
  case_id: string;
  title: string;
  case_closed: boolean;
  context_version: string;
  generated_at: string;
  source_mode: 'stored_analysis' | 'conditional_preparation';
  analysis_id: string | null;
  analysis_created_at: string | null;
  is_example: boolean;
  nodes: ScenarioNode[];
  sources: ScenarioSource[];
  current_facts: string[];
  uncertainties: string[];
  truncated: boolean;
  limits_note: string;
  disclaimer: string;
}
