export type CaseType = "is_hukuku" | "ticaret_hukuku" | "sozlesme" | "kira" | "icra" | "diger";
export type CaseStatus = "devam_eden" | "durusma_bekleyen" | "karar_bekleyen" | "kapali";
export type CaseOutcome = "ongoing" | "won" | "lost" | "settled";

export interface Case {
  id: string;
  law_firm_id: string;
  case_number: string;
  case_name: string;
  client_name: string;
  opposing_party: string | null;
  case_type: CaseType;
  court: string | null;
  assigned_lawyer_id: string | null;
  opening_date: string;
  next_hearing_date: string | null;
  status: CaseStatus;
  outcome: CaseOutcome;
  case_value: number | null;
  description: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseEvent {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  event_type: string;
  created_at: string;
}

export interface CaseDetail extends Case {
  timeline: CaseEvent[];
}

export type TaskStatus = "pending" | "completed";

export interface Task {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskWithCase extends Task {
  case_name: string;
  case_number: string;
}

export interface ActivityItem {
  id: string;
  case_id: string;
  case_name: string;
  title: string;
  event_type: string;
  event_date: string;
  created_at: string;
}

export interface CalendarEvent {
  event_type: "hearing" | "task";
  date: string;
  title: string;
  case_id: string;
  case_name: string;
  task_id: string | null;
}

export type UserRole = "admin" | "lawyer";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  law_firm_id: string;
  is_active: boolean;
}

export interface AIStatus {
  provider: string;
  configured: boolean;
  error: string | null;
}

export interface DocumentItem {
  id: string;
  case_id: string;
  filename: string;
  file_type: "pdf" | "docx" | "txt";
  extracted_text: string | null;
  uploaded_at: string;
}

export interface DocumentWithCase extends DocumentItem {
  case_name: string;
  case_number: string;
}

export interface Assessment {
  score: number;
  confidence: "low" | "medium" | "high";
}

export interface AIAnalysisResult {
  summary: string;
  strong_points: string[];
  weak_points: string[];
  opposing_arguments: string[];
  missing_information: string[];
  possible_scenarios: string[];
  questions: string[];
  recommended_actions: string[];
  assessment: Assessment;
  ai_disclaimer: string;
  requires_verification: boolean;
}

export type SimulationStatus = "pending" | "running" | "completed" | "failed";

export interface Simulation {
  id: string;
  case_id: string;
  status: SimulationStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  result: AIAnalysisResult | null;
  current_stage: string | null;
  failure_category: string | null;
}

export interface SimulationWithCase extends Simulation {
  case_name: string;
  case_number: string;
}

export type CourtroomRole = "plaintiff" | "defendant";
export type CourtroomDifficulty = "beginner" | "intermediate" | "advanced";
export type CourtroomStatus = "active" | "completed" | "failed" | "abandoned";
export type CourtroomPhase =
  | "opening" | "main_arguments" | "evidence" | "examination"
  | "rebuttal" | "closing" | "verdict";
export type CourtroomActor = "user" | "opponent" | "judge" | "system";
export type CourtroomAction =
  | "opening" | "argument" | "rebuttal" | "evidence"
  | "objection" | "answer" | "closing";

export interface CourtroomScenario {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  plaintiff_name: string;
  defendant_name: string;
  difficulty: CourtroomDifficulty;
  estimated_rounds: number;
  learning_objectives: string[];
  public_facts: string[];
  disputed_issues: string[];
  legal_context: string[];
}

export interface CourtroomEvidence {
  id: string;
  code: string;
  title: string;
  description: string;
  evidence_type: string;
  content: string;
  authenticity_status: string;
}

export interface CourtroomTurn {
  id: string;
  sequence_number: number;
  actor: CourtroomActor;
  legal_role: string;
  turn_type: string;
  content: string;
  evidence_code: string | null;
  evidence_title: string | null;
  structured_data: Record<string, unknown>;
  created_at: string;
}

export interface JudgeEvaluation {
  verdict: "plaintiff" | "defendant" | "partial" | "undetermined";
  summary: string;
  reasoning: string;
  evidence_assessment: string[];
  unanswered_questions: string[];
  user_strengths: string[];
  user_weaknesses: string[];
  learning_notes: string[];
  relevance_score: number;
  evidence_score: number;
  rebuttal_score: number;
  courtroom_strategy_score: number;
  total_score: number;
  confidence: "low" | "medium" | "high";
  requires_verification: boolean;
  disclaimer: string;
}

export interface CourtroomSessionSummary {
  id: string;
  scenario_id: string;
  scenario_title: string;
  chosen_role: CourtroomRole;
  status: CourtroomStatus;
  phase: CourtroomPhase;
  current_actor: CourtroomActor;
  round_number: number;
  max_rounds: number;
  total_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface CourtroomSession extends CourtroomSessionSummary {
  scenario: CourtroomScenario;
  role_brief: {
    objective?: string;
    known_facts?: string[];
    strategy_notes?: string[];
  };
  available_evidence: CourtroomEvidence[];
  turns: CourtroomTurn[];
  pending_judge_question: string | null;
  presented_evidence_codes: string[];
  admitted_evidence_codes: string[];
  rejected_evidence_codes: string[];
  error_message: string | null;
  failure_category: string | null;
  model: string | null;
  prompt_version: string;
  evaluation: JudgeEvaluation | null;
}

export interface CategoryBreakdown {
  case_type: CaseType;
  total: number;
  won: number;
  lost: number;
  win_rate: number;
}

export interface StatusBreakdown {
  status: CaseStatus;
  total: number;
}

export interface AnalyticsOverview {
  total_cases: number;
  active_cases: number;
  won_cases: number;
  lost_cases: number;
  win_rate: number;
  average_case_duration_days: number;
  by_category: CategoryBreakdown[];
  by_status: StatusBreakdown[];
}

export interface HandoverReport {
  case_id: string;
  case_overview: {
    case_number: string;
    case_name: string;
    client_name: string;
    opposing_party: string | null;
    case_type: string;
    court: string | null;
    status: string;
    opening_date: string;
  };
  timeline: CaseEvent[];
  current_situation: string;
  key_documents: DocumentItem[];
  important_arguments: string[];
  risks: string[];
  pending_tasks: string[];
  upcoming_dates: string[];
  recommended_next_steps: string[];
}

export type ReportKind = "cases" | "hearings" | "tasks" | "performance";

export interface ReportSummary {
  total_cases: number;
  upcoming_hearings_30d: number;
  open_tasks: number;
  win_rate: number;
}

// ---------- CaseBridge AI chat (Hukuk Asistanı) ----------

export type ChatRole = "user" | "assistant";
export type ChatMessageStatus = "streaming" | "complete" | "error" | "stopped";
export type ChatFeedbackValue = 1 | -1;
export type ChatLevel = "basic" | "standard" | "deep";

export interface ChatLevelInfo {
  level: ChatLevel;
  label: string;
  model: string;
}

export interface ChatStatus {
  provider: string;
  model: string;
  configured: boolean;
  /** True when messages leave the firm (e.g. OpenAI). */
  external: boolean;
  error: string | null;
  levels?: ChatLevelInfo[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Assistant messages only; null for user messages. */
  status: ChatMessageStatus | null;
  model: string | null;
  level?: ChatLevel | null;
  feedback: ChatFeedbackValue | null;
  created_at: string;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface ChatConversation extends ChatConversationSummary {
  messages: ChatMessage[];
}

export type ChatStreamEvent =
  | { type: "start"; user_message: ChatMessage; assistant_message_id: string }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage | null }
  | { type: "error"; message: string };
