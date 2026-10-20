/** Form rules and display helpers of the case page's "Duruşmalar" card. Dates are
 * "YYYY-MM-DD" strings and times "HH:MM" in the application's local time (the API sends and
 * stores naive local datetimes). */
import { formatDate } from "@/lib/labels";
import type { CaseHearing, HearingFields } from "@/types";

export const HEARING_TITLE = "Duruşma";
export const ALL_DAY_LABEL = "Tüm gün";
export const MAX_RESULT_NOTE = 4000;

export interface HearingFormState {
  date: string;
  time: string;
  all_day: boolean;
  duration: string;
  location: string;
  notes: string;
}

export interface HearingFormErrors {
  date?: string;
  time?: string;
  duration?: string;
}

export const EMPTY_HEARING_FORM: HearingFormState = {
  date: "",
  time: "09:00",
  all_day: false,
  duration: "60",
  location: "",
  notes: "",
};

export function hearingDay(hearing: Pick<CaseHearing, "starts_at">): string {
  return hearing.starts_at.slice(0, 10);
}

export function hearingTime(hearing: Pick<CaseHearing, "starts_at" | "all_day">): string {
  return hearing.all_day ? ALL_DAY_LABEL : hearing.starts_at.slice(11, 16);
}

/** "12.10.2026 · 14:30" or "12.10.2026 · Tüm gün". */
export function hearingWhen(hearing: Pick<CaseHearing, "starts_at" | "all_day">): string {
  return `${formatDate(hearingDay(hearing))} · ${hearingTime(hearing)}`;
}

export function hearingFormFromHearing(hearing: CaseHearing): HearingFormState {
  return {
    date: hearingDay(hearing),
    time: hearing.all_day ? EMPTY_HEARING_FORM.time : hearing.starts_at.slice(11, 16),
    all_day: hearing.all_day,
    duration: String(hearing.duration_minutes),
    location: hearing.location ?? "",
    notes: hearing.notes ?? "",
  };
}

/** The same rules as the calendar's event form. */
export function validateHearingForm(form: HearingFormState): HearingFormErrors {
  const errors: HearingFormErrors = {};
  if (!form.date) errors.date = "Tarih zorunludur.";
  if (!form.all_day && !form.time) errors.time = "Saat zorunludur.";
  const minutes = Number(form.duration);
  if (!form.all_day && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) {
    errors.duration = "Süre 5 ile 1440 dakika arasında olmalıdır.";
  }
  return errors;
}

export function hasHearingErrors(errors: HearingFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Only call with a form that passed validateHearingForm. */
export function buildHearingFields(form: HearingFormState): HearingFields {
  const minutes = Number(form.duration);
  return {
    starts_at: `${form.date}T${form.all_day ? "00:00" : form.time}:00`,
    all_day: form.all_day,
    duration_minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 60,
    location: form.location.trim() || null,
    notes: form.notes.trim() || null,
  };
}

/** The note after a hearing: required, trimmed, at most 4000 characters. */
export function validateResultNote(note: string): string | undefined {
  const trimmed = note.trim();
  if (!trimmed) return "Sonuç notu gerekli.";
  if (trimmed.length > MAX_RESULT_NOTE) return `En fazla ${MAX_RESULT_NOTE} karakter olabilir.`;
  return undefined;
}

/** "Yaklaşan": not past, earliest first; "Geçmiş": past, latest first. */
export function splitHearings(hearings: CaseHearing[]): { upcoming: CaseHearing[]; past: CaseHearing[] } {
  const byStart = (a: CaseHearing, b: CaseHearing) => a.starts_at.localeCompare(b.starts_at);
  return {
    upcoming: hearings.filter((h) => !h.is_past).sort(byStart),
    past: hearings.filter((h) => h.is_past).sort((a, b) => byStart(b, a)),
  };
}

/** The case overview's "Sonraki Duruşma": the earliest hearing that is not past. */
export function nextHearing(hearings: CaseHearing[]): CaseHearing | null {
  return splitHearings(hearings).upcoming[0] ?? null;
}
