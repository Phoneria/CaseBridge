import { managementRequest } from "@/lib/api";

export type RecordKind = "finance" | "time" | "client" | "communication" | "lead" | "approval" | "deadline" | "checklist" | "leave" | "publication" | "support";
export type DataValue = string | number | boolean | null | string[] | ChecklistStep[];
export interface ChecklistStep { title: string; done: boolean; depends_on: number | null }
export interface ManagementRecord {
  id: string; kind: RecordKind; title: string; status: string; case_id: string | null;
  owner_id: string | null; due_date: string | null; data: Record<string, DataValue>;
  version: number; created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
}
export type RecordWrite = Pick<ManagementRecord, "kind" | "title" | "status" | "case_id" | "owner_id" | "due_date" | "data"> & { version?: number };
export interface FinanceSummary {
  case_id: string; currency: string; fee: string; payment: string; expense: string; reimbursement: string;
  advance: string; advance_spend: string; labor_cost: string; minutes: number; fee_balance: string;
  expense_balance: string; advance_balance: string; estimated_margin: string;
}
export interface CapacityRow {
  id: string; name: string; department: string | null; position: string; active_cases: number;
  pending_tasks: number; overdue_tasks: number; due_this_week: number; hearings: number;
  scheduled_minutes: number; leaves: ManagementRecord[];
}
export interface BureauOverview {
  today: string; active_cases: number; pending_tasks: number; overdue_tasks: number; unassigned_cases: number;
  pending_approvals: number; upcoming_hearings: number;
  alerts: { id: string; title: string; detail: string; tone: string; href: string }[];
  capacity: CapacityRow[]; finance: FinanceSummary[];
}
export interface AccessGrant { user_id: string; position: string; case_ids: string[] }
export interface AuditRow { id: string; actor_name: string; action: string; entity_id: string; entity_type: string; reason: string; created_at: string; before?: unknown; after?: unknown }
export interface AuditPage { total: number; rows: AuditRow[] }
export interface AIManagement {
  used_tokens: number; period_start: string; policy: { token_budget: number; cost_per_million: string; currency: string };
  version: number; budget_exceeded: boolean; estimated_cost: string; coverage: string;
  operations: { name: string; count: number; failed: number }[];
}
export interface PlatformProfile {
  id: string; name: string; is_active: boolean; version: number; profile: Record<string, string | number | null>;
  usage: { active_users: number; pending_invites: number; case_count: number; document_count: number; storage_bytes: number; missing_files: number; failed_jobs_30d: number; pending_jobs: number; failed_reminders: number; active_7d: number; active_30d: number };
  onboarding: { label: string; done: boolean; next_action: string; owner: string }[];
  ai: { configured: boolean; pending: boolean };
}
export interface ScopedWorkspace {
  position: string;
  transfers?: WorkTransfer[];
  cases: { id: string; name: string; number?: string; status?: string }[];
  publications?: { id: string; title: string; case_id: string; message: string; request: string; appointment: string | null; financial_summary: string }[];
  documents?: { id: string; filename: string; case_id: string }[];
  records?: ManagementRecord[]; finance?: FinanceSummary[];
  tasks?: { id: string; case_id: string; title: string; status: string; due_date: string | null; assigned_to: string | null }[];
}
export interface WorkTransfer { id:string;from_user_id:string;to_user_id:string;reason:string;counts:Record<string,number>;created_at:string;accepted_at:string|null }

export const mgmt = {
  overview: () => managementRequest<BureauOverview>("/bureau/overview"),
  records: (deleted = false) => managementRequest<ManagementRecord[]>(`/bureau/records?deleted=${deleted}`),
  save: (body: RecordWrite, id?: string, base = "/bureau/records") => managementRequest<ManagementRecord>(id ? `${base}/${encodeURIComponent(id)}` : base, { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
  lifecycle: (row: ManagementRecord, action: "trash" | "restore", reason: string) => managementRequest<ManagementRecord>(`/bureau/records/${row.id}/${action}`, { method: "POST", body: JSON.stringify({ version: row.version, reason }) }),
  audit: (q = "", offset = 0, base = "/bureau/audit") => managementRequest<AuditPage>(`${base}?q=${encodeURIComponent(q)}&offset=${offset}`),
  access: () => managementRequest<AccessGrant[]>("/bureau/access"),
  setAccess: (id: string, body: {position: string; case_ids: string[]; reason: string}) => managementRequest<AccessGrant>(`/bureau/access/${id}`, {method: "PUT", body: JSON.stringify(body)}),
  invite: (body: {full_name: string; email: string; position: string; case_ids: string[]; reason: string}) => managementRequest<AccessGrant & {email_sent: boolean}>("/bureau/access/invite", {method: "POST", body: JSON.stringify(body)}),
  transfer: (id: string, target_id: string, reason: string) => managementRequest<Record<string, number>>(`/bureau/transfer/${id}`, {method: "POST", body: JSON.stringify({target_id, reason})}),
  transfers: () => managementRequest<WorkTransfer[]>("/bureau/transfers"),
  acceptTransfer: (id:string) => managementRequest<WorkTransfer>(`/bureau/workspace/transfers/${id}/accept`,{method:"POST"}),
  conflicts: (q: string) => managementRequest<{matches: {name: string; role: string; is_client: boolean; case_id: string; case_name: string}[]; notice: string}>(`/bureau/conflicts?q=${encodeURIComponent(q)}`),
  ai: () => managementRequest<AIManagement>("/bureau/ai-usage"),
  aiBudget: (body: AIManagement["policy"] & {version: number}) => managementRequest<AIManagement>("/bureau/ai-budget", {method:"PUT",body:JSON.stringify(body)}),
  profile: (id: string) => managementRequest<PlatformProfile>(`/platform/firms/${id}/profile`),
  saveProfile: (id: string, body: Record<string, unknown>) => managementRequest<{profile: PlatformProfile["profile"]; version: number}>(`/platform/firms/${id}/profile`, {method:"PUT", body:JSON.stringify(body)}),
  support: (id: string) => managementRequest<ManagementRecord[]>(`/platform/firms/${id}/support`),
  workspace: () => managementRequest<ScopedWorkspace>("/bureau/workspace"),
  decision: (row: ManagementRecord, status: string, note: string) => managementRequest<ManagementRecord>(`/bureau/workspace/records/${row.id}/decision`, {method:"POST", body:JSON.stringify({version: row.version, status, note})}),
  step: (row: ManagementRecord, index: number, done: boolean) => managementRequest<ManagementRecord>(`/bureau/workspace/records/${row.id}/step`, {method:"POST",body:JSON.stringify({version:row.version,index,done})}),
  completeTask: (id: string) => managementRequest(`/bureau/workspace/tasks/${id}/complete`, {method:"POST"}),
};

export const POSITION_LABELS: Record<string, string> = {admin:"Yönetici", lawyer:"Avukat", trainee:"Stajyer", secretary:"Sekreter", accountant:"Muhasebe", consultant:"Dış danışman", client:"Müvekkil"};
export const STATE_LABELS: Record<string, string> = { recorded:"Kaydedildi", active:"Aktif", inactive:"Pasif", new:"Yeni başvuru", meeting:"Görüşme", evaluation:"Değerlendirme", offer:"Teklif", contract:"Sözleşme", documents:"Belge toplama", opened:"Dava açıldı", declined:"Kabul edilmedi", draft:"Taslak", review:"İnceleme bekliyor", changes:"Düzeltme istendi", approved:"Onaylandı", open:"Açık", acknowledged:"Görüldü", completed:"Tamamlandı", requested:"Talep edildi", cancelled:"İptal", published:"Yayımlandı", in_progress:"İşlemde", resolved:"Çözüldü" };
export const FINANCE_LABELS: Record<string, string> = {fee:"Kararlaştırılan ücret", payment:"Ücret tahsilatı", expense:"Büro masrafı", reimbursement:"Masraf tahsilatı", advance:"Alınan masraf avansı", advance_spend:"Avanstan yapılan masraf"};
export const KIND_LABELS: Record<RecordKind, string> = {finance:"Mali kayıtlar", time:"Zaman kayıtları", client:"Müvekkiller", communication:"İletişim takibi", lead:"Yeni iş başvuruları", approval:"İnceleme ve onay", deadline:"Kritik süreler", checklist:"Kontrol listeleri", leave:"İzinler", publication:"Müvekkile paylaşımlar", support:"Destek talepleri"};
export const KIND_STATES: Record<RecordKind, string[]> = {finance:["recorded"],time:["recorded"],client:["active","inactive"],communication:["recorded"],lead:["new","meeting","evaluation","offer","contract","documents","opened","declined"],approval:["draft","review","changes","approved"],deadline:["open","acknowledged","completed"],checklist:["open","completed"],leave:["requested","approved","cancelled"],publication:["draft","published"],support:["open","in_progress","resolved"]};
export const INPUT = "mt-1 w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm text-navy-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:opacity-60";
export const BUTTON = "rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700 disabled:opacity-50";
export const SECONDARY = "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-50";
export const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";
export function money(value: string | number, currency: string) { return new Intl.NumberFormat("tr-TR", {style:"currency",currency}).format(Number(value)); }
export function dateLabel(value: string | null) { return value ? new Date(value.length === 10 ? `${value}T12:00:00` : /Z|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toLocaleDateString("tr-TR") : "—"; }
export function localDate() { return new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Istanbul"}).format(new Date()); }
