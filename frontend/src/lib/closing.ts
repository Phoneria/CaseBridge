/** Form rules of the "Davayı kapat" dialog. */
import type { CaseClosePayload, ClosingOutcome } from "@/types";

export const MAX_CLOSING_NOTE = 4000;

export const CLOSING_OUTCOME_OPTIONS: { value: ClosingOutcome; label: string }[] = [
  { value: "won", label: "Kazanıldı" },
  { value: "lost", label: "Kaybedildi" },
  { value: "settled", label: "Sulh" },
];

export interface CloseFormState {
  outcome: ClosingOutcome | "";
  decision_date: string;
  note: string;
}

export interface CloseErrors {
  outcome?: string;
  decision_date?: string;
  note?: string;
}

/** The browser's calendar date as YYYY-MM-DD (local time: toISOString would give the UTC date). */
export function todayLocalISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function validateClose(form: CloseFormState, today: string): CloseErrors {
  const errors: CloseErrors = {};
  if (!form.outcome) errors.outcome = "Sonuç seçin.";
  if (!form.decision_date) errors.decision_date = "Karar tarihi gerekli.";
  else if (form.decision_date > today) errors.decision_date = "Karar tarihi ileri bir tarih olamaz.";
  if (form.note.trim().length > MAX_CLOSING_NOTE) errors.note = `En fazla ${MAX_CLOSING_NOTE} karakter olabilir.`;
  return errors;
}

export function hasCloseErrors(errors: CloseErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Only call with a form that passed validateClose. */
export function buildClosePayload(form: CloseFormState): CaseClosePayload {
  const payload: CaseClosePayload = { outcome: form.outcome as ClosingOutcome, decision_date: form.decision_date };
  const note = form.note.trim();
  if (note) payload.note = note;
  return payload;
}
