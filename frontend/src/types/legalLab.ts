/** Types for the legal lab: knowledge map, counter-side analysis and the directed courtroom simulation. */

export interface LabStatus {
  mode: "mock" | "ai";
  note: string | null;
  stages: { id: string; name: string }[];
  chars: Record<string, string>;
}

export interface Trend {
  n: number;
  boz: number;
  base: number;
  lift: number | null;
}

export interface LawRef {
  code: string;
  title: string | null;
  text: string;
  trend: Trend | null;
}

export interface GraphNode {
  id: string;
  code: string;
  law: string;
  no: string;
  law_name: string;
  art: string;
  title: string | null;
  text: string;
  n: number;
  tot: number;
  boz: number | null;
  base: number | null;
  lift: number | null;
  ex: { id: string; out: string; ch: string; esas: string; karar: string; date: string }[];
}

export interface GraphEdge {
  s: string;
  t: string;
  w: number;
  j: number;
}

export interface LegalGraph {
  meta: { decisions: number; articles: number; edges: number; source: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CaseRef {
  case_id?: string | null;
  summary?: string | null;
}

export interface Finding {
  id: string;
  title: string;
  type: "risk" | "firsat";
  severity: number;
  stage: string;
  fact: string;
  rule: string;
  inference: string;
  action: string;
  legitimacy: "mesru" | "sinirda";
  basis: LawRef[];
  support: string;
  fact_ok: boolean;
}

export interface CounterAnalysis {
  mode: "mock" | "ai";
  note: string | null;
  findings: Finding[];
}

export type TrialSide = "davaci" | "davali" | "hakim";
export type CharKey = "hakim" | "davaci" | "davali" | "bilirkisi";
export type IntervMode = "order" | "say" | "direct" | "puppet" | "hukum" | "aside";

export interface Intervention {
  mode: IntervMode;
  target?: string | null;
  text: string;
  sonuc?: "kabul" | "kismen_kabul" | "red" | null;
}

export interface TrialTurn {
  who: string;
  text: string;
  stage_name?: string;
  law?: LawRef[];
}

export interface Karar {
  sonuc: "kabul" | "kismen_kabul" | "red";
  gerekce: string;
  hukum: string[];
  law: LawRef[];
  riskler: { risk: string; cozum: string }[];
}

export interface BeatResult {
  mode: "mock" | "ai";
  note: string | null;
  stage_idx: number;
  stage_name: string;
  turns: (TrialTurn & { basis: string[]; law: LawRef[] })[];
  stage_done: boolean;
  suggestions: string[];
  karar: Karar | null;
  dersler: string[];
  finished: boolean;
  idle: boolean;
}

export interface GuideResult {
  mode: "mock" | "ai";
  note: string | null;
  role: TrialSide;
  // judge guide
  hazir?: boolean;
  hazir_neden?: string;
  eksikler?: string[];
  uyusmazlik?: { konu: string; davaci: string; davali: string; durum: string }[];
  ispat?: { konu: string; yuk: string; neden: string; law: LawRef[] }[];
  sorular?: { kime: string; soru: string }[];
  sonraki?: { adim: string; neden: string; law: LawRef[] };
  yollar?: { sonuc: string; kosul: string; bozma_riski: string; law: LawRef[] }[];
  // lawyer guide
  durum?: string;
  guclu?: { nokta: string; law: LawRef[] }[];
  zayif?: { nokta: string; risk: string; cozum: string }[];
  karsi_hamle?: { hamle: string; karsilik: string }[];
  eksik_belge?: string[];
  hamleler?: { hamle: string; neden: string; risk: string; law: LawRef[] }[];
  sureler?: string[];
}

// ---------------------------------------------------------------- Emsal arama
export type PrecedentKind = "yargitay" | "bam" | "ilk_derece";

export interface PrecedentItem {
  doc_id: string;
  source: string;
  kind: PrecedentKind;
  kind_label: string;
  court: string;
  esas_no: string;
  karar_no: string;
  tarih: string;
  year: number | null;
  outcome: string;
  outcome_label: string;
  laws: string[];
  snippet: string;
  score: number | null;
  matched: string[];
  via: ("kelime" | "anlam")[];
  narr?: string;
  tail?: string;
}

export interface PrecedentStats {
  n: number;
  by_kind: Record<string, { label: string; total: number; outcomes: { key: string; label: string; n: number }[] }>;
  note: string;
}

export interface PrecedentSearchResult {
  results: PrecedentItem[];
  stats: PrecedentStats;
  mode: "hybrid" | "lexical" | "sample";
  indexed: number;
  terms: string[];
  query: string;
  note: string | null;
}

export interface PrecedentStatus {
  mode: "hybrid" | "lexical" | "sample";
  indexed: number;
  model: string | null;
  sources: string[];
  note: string | null;
  built?: string | null;
  eval?: Record<string, number> | null;
}

export interface PrecedentFilters {
  kinds: PrecedentKind[];
  outcomes: string[];
  year_min?: number | null;
  year_max?: number | null;
}

export interface PrecedentExplanation {
  doc_id: string;
  why: string;
  takeaway: string | null;
}
