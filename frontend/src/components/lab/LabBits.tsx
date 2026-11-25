"use client";

import { useEffect, useState } from "react";

import { getCases } from "@/lib/api";
import type { Case } from "@/types";
import type { CaseRef, LawRef } from "@/types/legalLab";

/** Shown whenever the response came from the predetermined mock instead of the model. */
export function ModeBanner({ mode, note }: { mode?: "mock" | "ai"; note?: string | null }) {
  if (mode !== "mock" || !note) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <span aria-hidden className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      <span>
        <span className="font-semibold">Gösterim modu. </span>
        {note}
      </span>
    </div>
  );
}

export function trendText(t: LawRef["trend"]): string | null {
  if (!t) return null;
  return `${t.n} Yargıtay kararında bu maddeye atıf var · %${Math.round(t.boz * 100)} bozulmuş (genel %${Math.round(t.base * 100)})`;
}

export function LawChip({ law }: { law: LawRef }) {
  const trend = trendText(law.trend);
  return (
    <details className="group inline-block max-w-full align-top">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 ring-1 ring-accent-100 hover:bg-accent-100">
        {law.code}
        {law.title ? <span className="text-accent-600/80">· {law.title}</span> : null}
      </summary>
      <div className="mt-2 max-w-md rounded-xl border border-surface-border bg-white p-3 text-xs leading-5 text-navy-600 shadow-card">
        {law.text ? <p>{law.text}</p> : <p>Madde metni bu önizlemede yok.</p>}
        {trend && <p className="mt-2 font-medium text-navy-800">{trend}</p>}
      </div>
    </details>
  );
}

/** Picks one of the firm's cases (to build the summary server-side) or lets the user paste a summary. */
export function CaseSource({ value, onChange }: { value: CaseRef; onChange: (ref: CaseRef) => void }) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getCases()
      .then((rows) => !cancelled && setCases(rows.filter((c) => !c.is_precedent)))
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);
  const selected = value.case_id ?? "";
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_1fr]">
      <div>
        <label htmlFor="lab-case" className="mb-1 block text-xs font-medium text-navy-600">
          Dava
        </label>
        <select
          id="lab-case"
          value={selected}
          onChange={(e) => onChange({ case_id: e.target.value || null, summary: e.target.value ? null : value.summary })}
          className="w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
        >
          <option value="">{loaded ? "— Dava seçin ya da özet yazın —" : "Yükleniyor…"}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.case_name} · {c.case_number}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="lab-summary" className="mb-1 block text-xs font-medium text-navy-600">
          Ya da dava özeti
        </label>
        <textarea
          id="lab-summary"
          rows={2}
          disabled={!!selected}
          value={selected ? "" : value.summary ?? ""}
          placeholder={selected ? "Seçili davanın bilgileri kullanılacak" : "Olayı ve talebi birkaç cümleyle yazın…"}
          onChange={(e) => onChange({ case_id: null, summary: e.target.value })}
          className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-navy-50"
        />
      </div>
    </div>
  );
}

export function hasCase(ref: CaseRef): boolean {
  return !!(ref.case_id || (ref.summary && ref.summary.trim().length > 0));
}

export const PRIMARY_BTN =
  "rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50";
export const GHOST_BTN =
  "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:border-accent-300 hover:text-accent-800 disabled:opacity-50";
