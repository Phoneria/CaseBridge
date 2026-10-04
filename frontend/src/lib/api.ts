import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ChatStatus,
  AnalyticsOverview,
  Case,
  CaseDetail,
  CaseEvent,
  CaseOutcome,
  CaseStatus,
  CaseType,
  DocumentItem,
  HandoverReport,
  ReportKind,
  ReportSummary,
  Simulation,
  SimulationWithCase,
  ActivityItem,
  CalendarEvent,
  CalendarEventPayload,
  CalendarEventRecord,
  NotificationStatus,
  TestEmailResult,
  AIStatus,
  AppUser,
  DocumentWithCase,
  Task,
  TaskStatus,
  TaskWithCase,
  CourtroomAction,
  CourtroomRole,
  CourtroomScenario,
  CourtroomSession,
  CourtroomSessionSummary,
} from "@/types";

import { ApiError } from "@/lib/apiError";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("casebridge_token");
}

export function setToken(token: string) {
  window.localStorage.setItem("casebridge_token", token);
}

export function clearToken() {
  window.localStorage.removeItem("casebridge_token");
}

/** Turns a non-2xx response into an ApiError (and handles 401 logout). */
async function throwApiError(response: Response): Promise<never> {
  let detail = `İstek başarısız oldu (${response.status}).`;
  try {
    const body = await response.json();
    if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
  } catch {
    // response had no JSON body - keep the generic message
  }

  if (response.status === 401) {
    // Session expired or token invalid/revoked - clear it and send
    // the user back to login instead of leaving them stuck on a
    // page that will keep failing every request. A hard redirect
    // (not router.push) because this runs from a plain fetch
    // wrapper with no access to Next.js router context.
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  throw new ApiError(detail, response.status);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) await throwApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function getMe(): Promise<AppUser> {
  return request("/users/me");
}

export async function listUsers(): Promise<AppUser[]> {
  return request("/users");
}

export async function getAiStatus(): Promise<AIStatus> {
  return request("/system/ai-status");
}

export interface CaseListFilters {
  search?: string;
  status?: CaseStatus;
  case_type?: CaseType;
  include_archived?: boolean;
  outcome?: CaseOutcome;
  active?: boolean;
  hearing_within_days?: number;
}

export async function getCases(filters: CaseListFilters = {}): Promise<Case[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.case_type) params.set("case_type", filters.case_type);
  if (filters.include_archived) params.set("include_archived", "true");
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.active !== undefined) params.set("active", String(filters.active));
  if (filters.hearing_within_days) params.set("hearing_within_days", String(filters.hearing_within_days));
  const query = params.toString();
  return request(`/cases${query ? `?${query}` : ""}`);
}

export async function createCase(payload: Record<string, unknown>): Promise<Case> {
  return request("/cases", { method: "POST", body: JSON.stringify(payload) });
}

export async function getCase(id: string): Promise<CaseDetail> {
  return request(`/cases/${id}`);
}

export async function updateCase(id: string, payload: Record<string, unknown>): Promise<Case> {
  return request(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function archiveCase(id: string): Promise<Case> {
  return request(`/cases/${id}/archive`, { method: "POST" });
}

export async function addCaseEvent(
  caseId: string,
  payload: { event_date: string; title: string; description?: string; event_type?: string }
): Promise<CaseEvent> {
  return request(`/cases/${caseId}/events`, { method: "POST", body: JSON.stringify(payload) });
}

export async function listCaseTasks(caseId: string): Promise<Task[]> {
  return request(`/cases/${caseId}/tasks`);
}

export async function createTask(
  caseId: string,
  payload: { title: string; description?: string; due_date?: string; assigned_to?: string; reminder_days?: number[] }
): Promise<Task> {
  return request(`/cases/${caseId}/tasks`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateTaskStatus(caseId: string, taskId: string, status: TaskStatus): Promise<Task> {
  return request(`/cases/${caseId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function listAllTasks(status?: TaskStatus): Promise<TaskWithCase[]> {
  const query = status ? `?status=${status}` : "";
  return request(`/tasks${query}`);
}

export async function listDocuments(caseId: string): Promise<DocumentItem[]> {
  return request(`/cases/${caseId}/documents`);
}

export async function uploadDocument(caseId: string, file: File): Promise<DocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/cases/${caseId}/documents`, { method: "POST", body: formData });
}

export async function deleteDocument(id: string): Promise<void> {
  return request(`/documents/${id}`, { method: "DELETE" });
}

export async function listAllDocuments(): Promise<DocumentWithCase[]> {
  return request(`/documents`);
}

export async function listSimulations(caseId: string): Promise<Simulation[]> {
  return request(`/cases/${caseId}/simulations`);
}

export async function startSimulation(caseId: string): Promise<Simulation> {
  return request(`/cases/${caseId}/simulations`, { method: "POST" });
}

export async function getSimulation(caseId: string, simulationId: string): Promise<Simulation> {
  return request(`/cases/${caseId}/simulations/${simulationId}`);
}

export async function retrySimulation(caseId: string, simulationId: string): Promise<Simulation> {
  return request(`/cases/${caseId}/simulations/${simulationId}/retry`, { method: "POST" });
}

export async function listAllSimulations(): Promise<SimulationWithCase[]> {
  return request(`/simulations`);
}

export async function listCourtroomScenarios(): Promise<CourtroomScenario[]> {
  return request("/courtroom-scenarios");
}

export async function listCourtroomSessions(): Promise<CourtroomSessionSummary[]> {
  return request("/courtroom-sessions");
}

export async function createCourtroomSession(
  scenarioId: string,
  chosenRole: CourtroomRole
): Promise<CourtroomSession> {
  return request("/courtroom-sessions", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId, chosen_role: chosenRole }),
  });
}

export async function getCourtroomSession(sessionId: string): Promise<CourtroomSession> {
  return request(`/courtroom-sessions/${sessionId}`);
}

export async function sendCourtroomMove(
  sessionId: string,
  payload: {
    content: string;
    action_type: CourtroomAction;
    evidence_code?: string;
    client_request_id: string;
  }
): Promise<CourtroomSession> {
  return request(`/courtroom-sessions/${sessionId}/moves`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function retryCourtroomSession(sessionId: string): Promise<CourtroomSession> {
  return request(`/courtroom-sessions/${sessionId}/retry`, { method: "POST" });
}

export async function abandonCourtroomSession(sessionId: string): Promise<CourtroomSession> {
  return request(`/courtroom-sessions/${sessionId}/abandon`, { method: "POST" });
}

export interface AnalyticsFilters {
  months?: 3 | 6 | 12;
  case_type?: CaseType;
}

export async function getAnalyticsOverview(filters: AnalyticsFilters = {}): Promise<AnalyticsOverview> {
  const params = new URLSearchParams();
  if (filters.months) params.set("months", String(filters.months));
  if (filters.case_type) params.set("case_type", filters.case_type);
  const query = params.toString();
  return request(`/analytics/overview${query ? `?${query}` : ""}`);
}

export async function generateHandover(caseId: string): Promise<HandoverReport> {
  return request(`/cases/${caseId}/handover`, { method: "POST" });
}

export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  return request(`/activity?limit=${limit}`);
}

export async function getCalendarEvents(range?: { from: string; to: string }): Promise<CalendarEvent[]> {
  const query = range ? `?${new URLSearchParams({ from: range.from, to: range.to }).toString()}` : "";
  return request(`/calendar${query}`);
}

export async function createCalendarEvent(payload: CalendarEventPayload): Promise<CalendarEventRecord> {
  return request("/calendar/events", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCalendarEvent(
  id: string,
  payload: Partial<CalendarEventPayload>,
): Promise<CalendarEventRecord> {
  return request(`/calendar/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  return request(`/calendar/events/${id}`, { method: "DELETE" });
}

/** null resets the task to the default reminder (1 day before). */
export async function updateTaskReminders(taskId: string, reminderDays: number[] | null): Promise<Task> {
  return request(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ reminder_days: reminderDays }) });
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return request("/notifications/status");
}

export async function sendTestEmail(): Promise<TestEmailResult> {
  return request("/notifications/test-email", { method: "POST" });
}

async function fetchBlob(path: string, errorPrefix: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    throw new ApiError(`${errorPrefix} (${response.status}).`, response.status);
  }
  return response.blob();
}

export async function downloadReportCsv(kind: ReportKind): Promise<Blob> {
  return fetchBlob(`/reports/${kind}.csv`, "Rapor indirilemedi");
}

export async function downloadCasesCsv(): Promise<Blob> {
  return downloadReportCsv("cases");
}

export async function getReportSummary(): Promise<ReportSummary> {
  return request(`/reports/summary`);
}

export async function downloadDocument(documentId: string): Promise<Blob> {
  return fetchBlob(`/documents/${documentId}/download`, "Belge indirilemedi");
}

// ---------- CaseBridge AI chat (Hukuk Asistanı) ----------

export async function getChatStatus(): Promise<ChatStatus> {
  return request("/chat/status");
}

export async function listChatConversations(): Promise<ChatConversationSummary[]> {
  return request("/chat/conversations");
}

export async function createChatConversation(): Promise<ChatConversationSummary> {
  return request("/chat/conversations", { method: "POST" });
}

export async function getChatConversation(id: string): Promise<ChatConversation> {
  return request(`/chat/conversations/${id}`);
}

export async function renameChatConversation(id: string, title: string): Promise<ChatConversationSummary> {
  return request(`/chat/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export async function deleteChatConversation(id: string): Promise<void> {
  return request(`/chat/conversations/${id}`, { method: "DELETE" });
}

/** value 0 clears the vote. */
export async function setChatFeedback(messageId: string, value: 1 | -1 | 0): Promise<ChatMessage> {
  return request(`/chat/messages/${messageId}/feedback`, { method: "PUT", body: JSON.stringify({ value }) });
}

export async function downloadChatExport(): Promise<Blob> {
  return fetchBlob("/chat/export.jsonl", "Eğitim verisi indirilemedi");
}

/** Opens the SSE reply stream. The body is read by lib/chatStream. */
export async function openChatStream(
  conversationId: string,
  content: string,
  signal?: AbortSignal,
): Promise<Response> {
  const token = getToken();
  const headers = new Headers({ "Content-Type": "application/json", Accept: "text/event-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
    signal,
  });
  if (!response.ok) await throwApiError(response);
  return response;
}
