"use client";

import { useRef, useState } from "react";

import { createCalendarEvent, updateCalendarEvent } from "@/lib/api";
import { DEFAULT_REMINDER_DAYS } from "@/lib/calendar";
import {
  EMPTY_HEARING_FORM,
  HEARING_TITLE,
  buildHearingFields,
  hasHearingErrors,
  hearingFormFromHearing,
  validateHearingForm,
  type HearingFormState,
} from "@/lib/hearings";
import { userMessage } from "@/lib/userMessages";
import type { Case, CaseHearing } from "@/types";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

interface Props {
  caseDetail: Pick<Case, "id" | "assigned_lawyer_id">;
  /** The hearing being edited; absent when adding. */
  hearing?: CaseHearing;
  onClose: () => void;
  /** Called after the hearing is stored; the caller reloads the hearings and the case. */
  onSaved: () => void;
}

/** "Duruşma ekle" / "Duruşmayı düzenle": the calendar event form's fields for a hearing of this case. */
export function CaseHearingFormModal({ caseDetail, hearing, onClose, onSaved }: Props) {
  const [form, setForm] = useState<HearingFormState>(() => (hearing ? hearingFormFromHearing(hearing) : EMPTY_HEARING_FORM));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateHearingForm(form);

  function setField<K extends keyof HearingFormState>(field: K, value: HearingFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (hasHearingErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const fields = buildHearingFields(form);
      if (hearing) {
        await updateCalendarEvent(hearing.id, fields);
      } else {
        await createCalendarEvent({
          ...fields,
          title: HEARING_TITLE,
          event_type: "hearing",
          case_id: caseDetail.id,
          assignee_id: caseDetail.assigned_lawyer_id,
          reminder_days: DEFAULT_REMINDER_DAYS.hearing,
        });
      }
      onSaved();
    } catch (err) {
      setError(userMessage(err, "Duruşma kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const shown = showErrors ? errors : {};
  return (
    <ModalFrame title={hearing ? "Duruşmayı düzenle" : "Duruşma ekle"} onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="hearing-date" className={LABEL}>Tarih</label>
          <input id="hearing-date" type="date" data-autofocus value={form.date} onChange={(e) => setField("date", e.target.value)} className={INPUT} />
          {shown.date && <p className="mt-1 text-xs text-red-600">{shown.date}</p>}
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-navy-700">
          <input type="checkbox" checked={form.all_day} onChange={(e) => setField("all_day", e.target.checked)} className="h-4 w-4 accent-accent-600" />
          Tüm gün
        </label>
        <div>
          <label htmlFor="hearing-time" className={LABEL}>Saat</label>
          <input id="hearing-time" type="time" value={form.time} disabled={form.all_day} onChange={(e) => setField("time", e.target.value)} className={INPUT} />
          {shown.time && <p className="mt-1 text-xs text-red-600">{shown.time}</p>}
        </div>
        <div>
          <label htmlFor="hearing-duration" className={LABEL}>Süre (dakika)</label>
          <input
            id="hearing-duration"
            type="number"
            min={5}
            max={1440}
            step={5}
            value={form.duration}
            disabled={form.all_day}
            onChange={(e) => setField("duration", e.target.value)}
            className={INPUT}
          />
          {shown.duration && <p className="mt-1 text-xs text-red-600">{shown.duration}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hearing-location" className={LABEL}>Salon / yer</label>
          <input id="hearing-location" value={form.location} maxLength={200} onChange={(e) => setField("location", e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hearing-notes" className={LABEL}>Not</label>
          <textarea id="hearing-notes" rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={INPUT} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
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
