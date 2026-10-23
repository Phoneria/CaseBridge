"use client";

import { useRef, useState } from "react";

import { addCaseEvent } from "@/lib/api";
import { CASE_EVENT_TYPE_LABELS, TIMELINE_FORM_TYPES, formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { CaseEvent, CaseEventType } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

const INPUT = "rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
const EMPTY_FORM = { event_date: "", title: "", event_type: "other" as CaseEventType, description: "" };

interface Props {
  caseId: string;
  timeline: CaseEvent[];
  /** Archived case: the list stays, the form goes. */
  readOnly: boolean;
  onAdded: (event: CaseEvent) => void;
}

/** "Gelişmeler": the case timeline with a type badge per entry, and a form for typed entries (not notes). */
export function CaseTimelinePanel({ caseId, timeline, readOnly, onAdded }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const description = form.description.trim();
    try {
      const created = await addCaseEvent(caseId, {
        event_date: form.event_date,
        title: form.title,
        event_type: form.event_type,
        ...(description ? { description } : {}),
      });
      onAdded(created);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(userMessage(err, "Gelişme eklenemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // The API answers event_date then created_at ascending; appended or re-dated entries must land in the same order.
  const ordered = [...timeline].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      {!readOnly && (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="event_date" className="mb-1 block text-xs font-medium text-navy-600">Tarih</label>
              <input id="event_date" type="date" required value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })} className={INPUT} />
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="event_title" className="mb-1 block text-xs font-medium text-navy-600">Gelişme Başlığı</label>
              <input id="event_title" required maxLength={255} value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} className={`w-full ${INPUT}`} />
            </div>
            <div>
              <label htmlFor="event_type" className="mb-1 block text-xs font-medium text-navy-600">Tür</label>
              <select id="event_type" value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value as CaseEventType })} className={`bg-white ${INPUT}`}>
                {TIMELINE_FORM_TYPES.map((type) => (
                  <option key={type} value={type}>{CASE_EVENT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="event_description" className="mb-1 block text-xs font-medium text-navy-600">Açıklama</label>
            <textarea id="event_description" rows={2} maxLength={4000} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className={`w-full ${INPUT}`} />
          </div>
          <div className="flex justify-end">
            <button type="submit" aria-disabled={saving}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60">
              {saving ? "Ekleniyor..." : "Ekle"}
            </button>
          </div>
        </form>
      )}
      {error && <ErrorState message={error} />}

      {timeline.length === 0 ? (
        <EmptyState message="Henüz gelişme yok." />
      ) : (
        <ol className="space-y-4">
          {ordered.map((entry) => (
            <li key={entry.id} className="flex gap-4">
              <div className="w-24 shrink-0 text-xs text-navy-500">{formatDate(entry.event_date)}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-navy-800">{entry.title}</p>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-navy-600">
                    {CASE_EVENT_TYPE_LABELS[entry.event_type] ?? entry.event_type}
                  </span>
                </div>
                {entry.description && entry.event_type !== "note" && (
                  <p className="whitespace-pre-line text-xs text-navy-500">{entry.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
