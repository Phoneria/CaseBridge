"use client";

import { formatTry } from "@/lib/clients";
import { buildHref } from "@/lib/filters";
import { CASE_OUTCOME_LABELS } from "@/lib/labels";
import type { CaseOutcome, PassagePair, SimilarPrecedentsSummary, TextHighlight } from "@/types";

export const CLIENT_ROLE_LABELS: Record<string, string> = { plaintiff: "Davacı", defendant: "Davalı", other: "Diğer" };
export const OUTCOME_ORDER: CaseOutcome[] = ["won", "lost", "settled", "ongoing"];

export function precedentHref(id: string): string {
  return buildHref("/emsaller", { karar: id });
}

const MONTHS = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function formatMonths(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `${MONTHS.format(value)} ay`;
}

export function formatValue(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : formatTry(value);
}

/** "12 emsal · 8 kazanıldı · 3 kaybedildi · ort. 14 ay · ort. değer ₺250.000"; averages only when stored. */
export function summaryLine(summary: SimilarPrecedentsSummary): string {
  const parts = [`${summary.count} emsal`];
  for (const outcome of OUTCOME_ORDER) {
    const n = summary.outcomes[outcome];
    if (n) parts.push(`${n} ${CASE_OUTCOME_LABELS[outcome].toLocaleLowerCase("tr-TR")}`);
  }
  const months = formatMonths(summary.avg_duration_months);
  if (months) parts.push(`ort. ${months}`);
  const value = formatValue(summary.avg_case_value);
  if (value) parts.push(`ort. değer ${value}`);
  return parts.join(" · ");
}

/** Splits text into plain and highlighted runs. Offsets come from the API and index the same string. */
export function highlightRuns(text: string, highlights: TextHighlight[]): { text: string; marked: boolean }[] {
  const runs: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const { start, end } of [...highlights].sort((a, b) => a.start - b.start)) {
    if (start < at || end > text.length || end <= start) continue;
    if (start > at) runs.push({ text: text.slice(at, start), marked: false });
    runs.push({ text: text.slice(start, end), marked: true });
    at = end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), marked: false });
  return runs;
}

function Highlighted({ text, highlights }: { text: string; highlights: TextHighlight[] }) {
  return (
    <>
      {highlightRuns(text, highlights).map((run, index) =>
        run.marked ? (
          <mark key={index} className="rounded bg-accent-100 px-0.5 text-navy-900">{run.text}</mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">{children}</p>;
}

export function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionTitle>{label}</SectionTitle>
      <ul aria-label={label} className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] text-navy-700">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Passage({ pair }: { pair: PassagePair }) {
  return (
    <li className="grid gap-2 rounded-xl border border-surface-border p-3 text-xs leading-relaxed text-navy-700">
      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">Bu dava · {pair.case_label}</p>
        <p><Highlighted text={pair.case_text} highlights={pair.case_highlights} /></p>
      </div>
      <div className="border-t border-surface-border pt-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">Emsal · {pair.precedent_label}</p>
        <p><Highlighted text={pair.precedent_text} highlights={pair.precedent_highlights} /></p>
      </div>
    </li>
  );
}

export function Passages({ passages }: { passages: PassagePair[] }) {
  if (passages.length === 0) return null;
  return (
    <div>
      <SectionTitle>Eşleşen pasajlar</SectionTitle>
      <ol aria-label="Eşleşen pasajlar" className="mt-1 space-y-2">
        {passages.map((pair, index) => <Passage key={index} pair={pair} />)}
      </ol>
    </div>
  );
}
