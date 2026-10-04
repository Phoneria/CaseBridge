/**
 * Calendar helpers: local-date arithmetic, fetch ranges per view, week-grid
 * geometry, filtering and Turkish labels. Dates are "YYYY-MM-DD" strings in
 * local time; item start/end are naive local ISO datetimes from the API.
 */
import { parseDateOnly, toDateKey, type CalendarQuery, type CalendarTypeSlug } from "@/lib/filters";
import type { CalendarEvent, CalendarEventType } from "@/types";

export { toDateKey };

export const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const WEEKDAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export const EVENT_TYPE_LABELS: Record<CalendarEvent["event_type"], string> = {
  hearing: "Duruşma",
  meeting: "Toplantı",
  client_meeting: "Müvekkil görüşmesi",
  other: "Diğer",
  task: "Görev",
};
export const EVENT_TYPE_OPTIONS: CalendarEventType[] = ["hearing", "meeting", "client_meeting", "other"];
export const TYPE_SLUG_TO_EVENT_TYPE: Record<CalendarTypeSlug, CalendarEvent["event_type"]> = {
  durusma: "hearing",
  toplanti: "meeting",
  muvekkil: "client_meeting",
  diger: "other",
  gorev: "task",
};

/** Must match app/domain/calendar.py. */
export const DEFAULT_REMINDER_DAYS: Record<CalendarEventType, number[]> = {
  hearing: [3, 1],
  meeting: [1],
  client_meeting: [1],
  other: [1],
};
export const REMINDER_OPTIONS = [0, 1, 3, 7] as const;

export function reminderDayLabel(days: number): string {
  return days === 0 ? "Aynı gün" : `${days} gün önce`;
}

export function describeReminders(days: number[]): string {
  if (days.length === 0) return "Hatırlatma yok";
  return [...days].sort((a, b) => b - a).map(reminderDayLabel).join(", ");
}

// ---------- dates ----------

export const parseDateKey = parseDateOnly;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function monthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
}

export function monthFromKey(key: string | undefined): Date | null {
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function formatDayLong(key: string): string {
  const date = parseDateKey(key);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ${WEEKDAY_NAMES[(date.getDay() + 6) % 7]}`;
}

export interface DateRange {
  from: string;
  to: string;
}

export const AGENDA_DAYS = 30;

export function monthRange(month: Date): DateRange {
  return {
    from: toDateKey(new Date(month.getFullYear(), month.getMonth(), 1)),
    to: toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
  };
}

export function weekRange(weekStart: Date): DateRange {
  return { from: toDateKey(weekStart), to: toDateKey(addDays(weekStart, 6)) };
}

export function agendaRange(today: Date): DateRange {
  return { from: toDateKey(today), to: toDateKey(addDays(today, AGENDA_DAYS - 1)) };
}

// ---------- items ----------

export function isTimed(item: CalendarEvent): boolean {
  return !item.all_day && item.start !== null;
}

export function timeLabel(iso: string): string {
  return iso.slice(11, 16);
}

function minutesOfDay(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function durationMinutes(item: CalendarEvent): number {
  if (!item.start || !item.end) return 60;
  return Math.round((Date.parse(item.end) - Date.parse(item.start)) / 60_000);
}

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
export const HOUR_HEIGHT = 48; // px per hour in the week grid

/** Position of a timed item in the 08:00-20:00 week grid (clamped to the grid). */
export function timedBlock(item: CalendarEvent): { top: number; height: number } {
  const gridStart = DAY_START_HOUR * 60;
  const gridEnd = DAY_END_HOUR * 60;
  const start = minutesOfDay(item.start ?? "T00:00");
  const from = Math.min(Math.max(start, gridStart), gridEnd - 15);
  const to = Math.max(Math.min(start + durationMinutes(item), gridEnd), from + 15);
  return { top: ((from - gridStart) * HOUR_HEIGHT) / 60, height: ((to - from) * HOUR_HEIGHT) / 60 };
}

export function groupByDate(items: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return items.reduce<Record<string, CalendarEvent[]>>((acc, item) => {
    (acc[item.date] ??= []).push(item);
    return acc;
  }, {});
}

export function filterCalendarItems(items: CalendarEvent[], query: CalendarQuery, meId: string | null): CalendarEvent[] {
  const type = query.tur ? TYPE_SLUG_TO_EVENT_TYPE[query.tur] : undefined;
  return items.filter((item) => {
    if (type && item.event_type !== type) return false;
    if (query.sorumlu && item.assignee_id !== query.sorumlu) return false;
    if (query.dava && item.case_id !== query.dava) return false;
    if (query.benim && (!meId || item.assignee_id !== meId)) return false;
    return true;
  });
}
