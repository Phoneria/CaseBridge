/**
 * Single source of truth for URL query params <-> API filters and for every
 * in-app link to a filtered list. Components must build links with these
 * helpers so a card's number and the list it opens can never drift apart
 * (spec 5.1).
 */
import type { CaseListFilters } from "@/lib/api";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { CaseOutcome, CaseStatus, CaseType, DocumentItem, DocumentWithCase, TaskWithCase } from "@/types";

type ParamSource = { get(name: string): string | null };

export const CASE_TYPES: CaseType[] = ["is_hukuku", "ticaret_hukuku", "sozlesme", "kira", "icra", "diger"];
export const CASE_STATUSES: CaseStatus[] = ["devam_eden", "durusma_bekleyen", "karar_bekleyen", "kapali"];

export const OUTCOME_SLUGS = {
  kazanilan: "won",
  kaybedilen: "lost",
  sulh: "settled",
  devam: "ongoing",
} as const satisfies Record<string, CaseOutcome>;
export type OutcomeSlug = keyof typeof OUTCOME_SLUGS;
const OUTCOME_SLUG_VALUES = Object.keys(OUTCOME_SLUGS) as OutcomeSlug[];

export const OUTCOME_SLUG_LABELS: Record<OutcomeSlug, string> = {
  kazanilan: "Kazanılan",
  kaybedilen: "Kaybedilen",
  sulh: "Uzlaşma",
  devam: "Devam Eden",
};

/** Must match UPCOMING_HEARING_WINDOW_DAYS in backend report_service.py. */
export const UPCOMING_HEARING_DAYS = 30;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function buildHref(path: string, params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

// ---------- Dates (date-only strings are interpreted in local time) ----------

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Local date -> "YYYY-MM-DD". */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(value: string, today: Date = new Date()): number {
  const ms = parseDateOnly(value).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

// ---------- Cases (/davalar) ----------

export interface CaseListQuery {
  ara?: string;
  kategori?: CaseType;
  durum?: CaseStatus | "aktif";
  sonuc?: OutcomeSlug;
  durusma?: "yaklasan";
  arsiv?: "dahil";
}

export const CASE_LIST_PARAM_KEYS = ["ara", "kategori", "durum", "sonuc", "durusma", "arsiv"] as const;
const DURUM_VALUES: ReadonlyArray<CaseStatus | "aktif"> = [...CASE_STATUSES, "aktif"];

export function parseCaseListQuery(params: ParamSource): CaseListQuery {
  const ara = params.get("ara")?.trim();
  return compact({
    ara: ara || undefined,
    kategori: pick(params.get("kategori"), CASE_TYPES),
    durum: pick(params.get("durum"), DURUM_VALUES),
    sonuc: pick(params.get("sonuc"), OUTCOME_SLUG_VALUES),
    durusma: pick(params.get("durusma"), ["yaklasan"] as const),
    arsiv: pick(params.get("arsiv"), ["dahil"] as const),
  });
}

export function caseListHref(query: CaseListQuery = {}): string {
  return buildHref("/davalar", {
    ara: query.ara,
    kategori: query.kategori,
    durum: query.durum,
    sonuc: query.sonuc,
    durusma: query.durusma,
    arsiv: query.arsiv,
  });
}

/** Links from analytics numbers: analytics counts archived cases, so the list must too. */
export function analyticsCaseListHref(query: Omit<CaseListQuery, "arsiv"> = {}): string {
  return caseListHref({ ...query, arsiv: "dahil" });
}

export function toCaseListFilters(query: CaseListQuery): CaseListFilters {
  const filters: CaseListFilters = {};
  if (query.ara) filters.search = query.ara;
  if (query.kategori) filters.case_type = query.kategori;
  if (query.durum === "aktif") filters.active = true;
  else if (query.durum) filters.status = query.durum;
  if (query.sonuc) filters.outcome = OUTCOME_SLUGS[query.sonuc];
  if (query.durusma === "yaklasan") filters.hearing_within_days = UPCOMING_HEARING_DAYS;
  if (query.arsiv === "dahil") filters.include_archived = true;
  return filters;
}

export interface FilterChip {
  key: string;
  label: string;
}

export function describeCaseListQuery(query: CaseListQuery): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.ara) chips.push({ key: "ara", label: `Arama: ${query.ara}` });
  if (query.kategori) chips.push({ key: "kategori", label: `Kategori: ${CASE_TYPE_LABELS[query.kategori]}` });
  if (query.durum) {
    chips.push({ key: "durum", label: `Durum: ${query.durum === "aktif" ? "Aktif" : CASE_STATUS_LABELS[query.durum]}` });
  }
  if (query.sonuc) chips.push({ key: "sonuc", label: `Sonuç: ${OUTCOME_SLUG_LABELS[query.sonuc]}` });
  if (query.durusma) chips.push({ key: "durusma", label: `Duruşma: önümüzdeki ${UPCOMING_HEARING_DAYS} gün` });
  if (query.arsiv) chips.push({ key: "arsiv", label: "Arşiv dahil" });
  return chips;
}

// ---------- Tasks (/gorevler) — filtered client-side ----------

export interface TaskListQuery {
  durum?: "acik" | "tamamlanan";
  vade?: "7gun" | "gecikmis";
  dava?: string;
}

export const TASK_LIST_PARAM_KEYS = ["durum", "vade", "dava"] as const;

export function parseTaskListQuery(params: ParamSource): TaskListQuery {
  return compact({
    durum: pick(params.get("durum"), ["acik", "tamamlanan"] as const),
    vade: pick(params.get("vade"), ["7gun", "gecikmis"] as const),
    dava: params.get("dava") || undefined,
  });
}

export function taskListHref(query: TaskListQuery = {}): string {
  return buildHref("/gorevler", { durum: query.durum, vade: query.vade, dava: query.dava });
}

export function isOverdue(task: TaskWithCase, today: Date = new Date()): boolean {
  return task.status !== "completed" && !!task.due_date && parseDateOnly(task.due_date) < startOfDay(today);
}

export function isDueWithinWeek(task: TaskWithCase, today: Date = new Date()): boolean {
  if (task.status === "completed" || !task.due_date) return false;
  const days = daysUntil(task.due_date, today);
  return days >= 0 && days <= 7;
}

export function filterTasks(tasks: TaskWithCase[], query: TaskListQuery, today: Date = new Date()): TaskWithCase[] {
  return tasks.filter((task) => {
    if (query.durum === "acik" && task.status === "completed") return false;
    if (query.durum === "tamamlanan" && task.status !== "completed") return false;
    if (query.vade === "7gun" && !isDueWithinWeek(task, today)) return false;
    if (query.vade === "gecikmis" && !isOverdue(task, today)) return false;
    if (query.dava && task.case_id !== query.dava) return false;
    return true;
  });
}

export function sortTasks(tasks: TaskWithCase[], today: Date = new Date()): TaskWithCase[] {
  return [...tasks].sort((a, b) => {
    const overdueFirst = Number(isOverdue(b, today)) - Number(isOverdue(a, today));
    if (overdueFirst !== 0) return overdueFirst;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
  });
}

export function describeTaskListQuery(query: TaskListQuery, caseLabel: (caseId: string) => string | undefined): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.durum) chips.push({ key: "durum", label: query.durum === "acik" ? "Açık görevler" : "Tamamlanan görevler" });
  if (query.vade) chips.push({ key: "vade", label: query.vade === "7gun" ? "7 gün içinde" : "Gecikmiş" });
  if (query.dava) chips.push({ key: "dava", label: `Dava: ${caseLabel(query.dava) ?? "—"}` });
  return chips;
}

// ---------- Documents (/belgeler) — filtered client-side ----------

export interface DocumentListQuery {
  ara?: string;
  tur?: DocumentItem["file_type"];
  dava?: string;
}

export const DOCUMENT_LIST_PARAM_KEYS = ["ara", "tur", "dava"] as const;
const DOCUMENT_TYPES: DocumentItem["file_type"][] = ["pdf", "docx", "txt"];

export function parseDocumentListQuery(params: ParamSource): DocumentListQuery {
  const ara = params.get("ara")?.trim();
  return compact({
    ara: ara || undefined,
    tur: pick(params.get("tur"), DOCUMENT_TYPES),
    dava: params.get("dava") || undefined,
  });
}

export function filterDocuments(documents: DocumentWithCase[], query: DocumentListQuery): DocumentWithCase[] {
  const needle = query.ara?.toLocaleLowerCase("tr-TR");
  return documents.filter((doc) => {
    if (query.tur && doc.file_type !== query.tur) return false;
    if (query.dava && doc.case_id !== query.dava) return false;
    if (needle && !doc.filename.toLocaleLowerCase("tr-TR").includes(needle)) return false;
    return true;
  });
}

export function describeDocumentListQuery(query: DocumentListQuery, caseLabel: (caseId: string) => string | undefined): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.ara) chips.push({ key: "ara", label: `Arama: ${query.ara}` });
  if (query.tur) chips.push({ key: "tur", label: `Tür: ${query.tur.toUpperCase()}` });
  if (query.dava) chips.push({ key: "dava", label: `Dava: ${caseLabel(query.dava) ?? "—"}` });
  return chips;
}

// ---------- Calendar (/takvim) ----------

export const CALENDAR_VIEWS = ["ay", "hafta", "ajanda"] as const;
export type CalendarViewSlug = (typeof CALENDAR_VIEWS)[number];
export const CALENDAR_TYPE_SLUGS = ["durusma", "toplanti", "muvekkil", "diger", "gorev"] as const;
export type CalendarTypeSlug = (typeof CALENDAR_TYPE_SLUGS)[number];
/** URL keys of the calendar filters (cleared together by "Filtreleri temizle"). */
export const CALENDAR_FILTER_KEYS = ["tur", "sorumlu", "dava", "benim"] as const;

export interface CalendarQuery {
  gorunum?: Exclude<CalendarViewSlug, "ay">; // absent = month view
  ay?: string; // YYYY-MM
  hafta?: string; // YYYY-MM-DD (any day; the view starts on its Monday)
  tur?: CalendarTypeSlug;
  sorumlu?: string; // user id
  dava?: string; // case id
  benim?: "1";
}

function validDateKey(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return toDateKey(parseDateOnly(value)) === value ? value : undefined;
}

export function parseCalendarQuery(params: ParamSource): CalendarQuery {
  const ay = params.get("ay");
  const gorunum = pick(params.get("gorunum"), CALENDAR_VIEWS);
  return compact({
    gorunum: gorunum === "ay" ? undefined : gorunum,
    ay: ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay) ? ay : undefined,
    hafta: validDateKey(params.get("hafta")),
    // Legacy ?goster=durusma|gorev links keep working.
    tur: pick(params.get("tur"), CALENDAR_TYPE_SLUGS) ?? pick(params.get("goster"), ["durusma", "gorev"] as const),
    sorumlu: params.get("sorumlu") || undefined,
    dava: params.get("dava") || undefined,
    benim: pick(params.get("benim"), ["1"] as const),
  });
}

// ---------- Case detail tabs ----------

export const CASE_TAB_SLUGS = ["genel", "belgeler", "gelismeler", "gorevler", "ai", "devir", "notlar"] as const;
export type CaseTabSlug = (typeof CASE_TAB_SLUGS)[number];

/** Legacy slugs that still open a tab after a rename. */
const CASE_TAB_ALIASES: Record<string, CaseTabSlug> = { simulasyonlar: "ai" };

export function parseCaseTab(value: string | null): CaseTabSlug {
  if (value !== null && Object.prototype.hasOwnProperty.call(CASE_TAB_ALIASES, value)) return CASE_TAB_ALIASES[value];
  return pick(value, CASE_TAB_SLUGS) ?? "genel";
}

export function caseDetailHref(caseId: string, sekme?: CaseTabSlug): string {
  return buildHref(`/davalar/${caseId}`, { sekme: sekme && sekme !== "genel" ? sekme : undefined });
}
