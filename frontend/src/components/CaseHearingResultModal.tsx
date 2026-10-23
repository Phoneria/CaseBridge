"use client";

import { useRef, useState } from "react";

import { recordHearingResult } from "@/lib/api";
import {
  EMPTY_HEARING_FORM,
  MAX_RESULT_NOTE,
  buildHearingFields,
  hasHearingErrors,
  hearingWhen,
  validateHearingForm,
  validateResultNote,
  type HearingFormState,
} from "@/lib/hearings";
import { userMessage } from "@/lib/userMessages";
import type { CaseHearing, HearingResultPayload } from "@/types";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

interface Props {
  hearing: CaseHearing;
  /** A closed case can take a result note but no further hearing. */
  canAddNext: boolean;
  onClose: () => void;
  /** Called after the result is stored; the caller reloads the hearings and the case. */
  onSaved: () => void;
}

/** "Sonuç gir" / "Sonucu düzenle": the note after a hearing and, optionally, the next hearing. */
export function CaseHearingResultModal({ hearing, canAddNext, onClose, onSaved }: Props) {
  const [note, setNote] = useState(hearing.result_note ?? "");
  const [addNext, setAddNext] = useState(false);
  const [next, setNext] = useState<HearingFormState>(EMPTY_HEARING_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const noteError = validateResultNote(note);
  const nextErrors = addNext ? validateHearingForm(next) : {};

  function setField<K extends keyof HearingFormState>(field: K, value: HearingFormState[K]) {
    setNext((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (noteError || hasHearingErrors(nextErrors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload: HearingResultPayload = { result_note: note.trim() };
      if (addNext) {
        const fields = buildHearingFields(next);
        payload.next_hearing = {
          starts_at: fields.starts_at,
          all_day: fields.all_day,
          duration_minutes: fields.duration_minutes,
          location: fields.location,
        };
      }
      await recordHearingResult(hearing.id, payload);
      onSaved();
    } catch (err) {
      setError(userMessage(err, "Sonuç kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={hearing.result_note ? "Sonucu düzenle" : "Sonuç gir"} onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-navy-600">Duruşma: {hearingWhen(hearing)}</p>
        <div>
          <label htmlFor="result-note" className={LABEL}>Sonuç / ara karar notu</label>
          <textarea
            id="result-note"
            data-autofocus
            rows={5}
            value={note}
            maxLength={MAX_RESULT_NOTE + 1}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT}
          />
          {showErrors && noteError && <p className="mt-1 text-xs text-red-600">{noteError}</p>}
        </div>
        {canAddNext && (
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={addNext} onChange={(e) => setAddNext(e.target.checked)} className="h-4 w-4 accent-accent-600" />
            Sonraki duruşmayı ekle
          </label>
        )}
        {canAddNext && addNext && (
          <div className="grid gap-3 rounded-xl border border-surface-border p-3 sm:grid-cols-2">
            <div>
              <label htmlFor="next-date" className={LABEL}>Tarih</label>
              <input id="next-date" type="date" value={next.date} onChange={(e) => setField("date", e.target.value)} className={INPUT} />
              {showErrors && nextErrors.date && <p className="mt-1 text-xs text-red-600">{nextErrors.date}</p>}
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-navy-700">
              <input type="checkbox" checked={next.all_day} onChange={(e) => setField("all_day", e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Tüm gün
            </label>
            <div>
              <label htmlFor="next-time" className={LABEL}>Saat</label>
              <input id="next-time" type="time" value={next.time} disabled={next.all_day} onChange={(e) => setField("time", e.target.value)} className={INPUT} />
              {showErrors && nextErrors.time && <p className="mt-1 text-xs text-red-600">{nextErrors.time}</p>}
            </div>
            <div>
              <label htmlFor="next-location" className={LABEL}>Salon / yer</label>
              <input id="next-location" value={next.location} maxLength={200} onChange={(e) => setField("location", e.target.value)} className={INPUT} />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            aria-disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button type="submit" aria-disabled={saving} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
