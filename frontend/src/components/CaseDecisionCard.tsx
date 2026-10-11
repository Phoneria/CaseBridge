import { CASE_OUTCOME_LABELS, formatDate } from "@/lib/labels";
import type { Case } from "@/types";

const CLOSED_OUTCOMES = new Set(["won", "lost", "settled"]);

/** "Karar bilgisi" of a closed case; what a case closed before decisions were recorded lacks shows as "—". */
export function CaseDecisionCard({ caseDetail }: { caseDetail: Case }) {
  const rows: [string, string][] = [
    ["Sonuç", CLOSED_OUTCOMES.has(caseDetail.outcome) ? CASE_OUTCOME_LABELS[caseDetail.outcome] : "—"],
    ["Karar tarihi", caseDetail.decision_date ? formatDate(caseDetail.decision_date) : "—"],
    ["Karar notu", caseDetail.closing_note?.trim() ? caseDetail.closing_note : "—"],
  ];
  return (
    <section aria-labelledby="karar-bilgisi-baslik" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <h2 id="karar-bilgisi-baslik" className="mb-3 text-sm font-semibold text-navy-800">
        Karar bilgisi
      </h2>
      <dl className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
            <dd className="whitespace-pre-wrap text-sm text-navy-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
