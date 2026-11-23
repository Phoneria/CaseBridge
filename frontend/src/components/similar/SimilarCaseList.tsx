import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import { outcomeColor } from "@/lib/chartTheme";
import { buildHref, caseDetailHref } from "@/lib/filters";
import { CASE_OUTCOME_LABELS, CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import type { SimilarCase } from "@/types";

const DECIDED = new Set(["won", "lost", "settled"]);

export function similarHref(item: SimilarCase): string {
  return item.is_precedent ? buildHref("/emsaller", { karar: item.case_id }) : caseDetailHref(item.case_id);
}

function resultLabel(item: SimilarCase): string {
  return DECIDED.has(item.outcome) ? CASE_OUTCOME_LABELS[item.outcome] : CASE_STATUS_LABELS[item.status] ?? item.status;
}

function durationLabel(item: SimilarCase): string | null {
  if (item.duration_days === null) return null;
  return `${item.duration_days.toLocaleString("tr-TR")} gün${item.duration_ongoing ? " (sürüyor)" : ""}`;
}

/** Ranked similar cases: score, result badge, duration, lawyer, reasons and a link. Used by the case card and the AI page. */
export function SimilarCaseList({ items, emptyMessage, emptyHint }: { items: SimilarCase[]; emptyMessage: string; emptyHint?: string }) {
  if (items.length === 0) return <EmptyState message={emptyMessage} hint={emptyHint} />;
  return (
    <ol aria-label="Benzer davalar" className="divide-y divide-surface-border">
      {items.map((item) => {
        const duration = durationLabel(item);
        return (
          <li key={item.case_id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
            <span
              aria-label={`Benzerlik ${item.score} / 100`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-sm font-semibold text-accent-800 ring-1 ring-accent-100"
            >
              {item.score}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={similarHref(item)} className="text-sm font-semibold text-navy-900 hover:text-accent-700 hover:underline">
                  {item.case_name}
                </Link>
                {item.is_precedent && (
                  <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-600">Emsal</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-600">
                <span>{item.case_number}</span>
                <span>{CASE_TYPE_LABELS[item.case_type] ?? item.case_type}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-2 py-0.5 font-medium text-navy-700">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcomeColor(item.outcome, item.status) }} />
                  {resultLabel(item)}
                </span>
                {duration && <span>Süre: {duration}</span>}
                {item.decision_date && <span>Karar: {formatDate(item.decision_date)}</span>}
                {item.assigned_lawyer_name && <span>Avukat: {item.assigned_lawyer_name}</span>}
              </div>
              {item.reasons.length > 0 && (
                <ul aria-label="Benzerlik nedenleri" className="flex flex-wrap gap-1.5">
                  {item.reasons.map((reason) => (
                    <li key={reason} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] text-navy-700">{reason}</li>
                  ))}
                </ul>
              )}
            </div>
            <Link href={similarHref(item)} className="shrink-0 self-start text-xs font-semibold text-accent-700 hover:underline">
              {item.is_precedent ? "Karara git" : "Davaya git"}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
