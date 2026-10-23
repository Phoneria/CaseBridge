"use client";

import { CASE_OUTCOME_LABELS, CASE_STATUS_LABELS } from "@/lib/labels";
import type { CaseAction } from "@/lib/caseAccess";
import type { Case } from "@/types";
import { CaseActionsMenu } from "@/components/CaseActionsMenu";

const OUTCOME_BADGE_STYLES: Record<string, string> = {
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
  settled: "bg-slate-100 text-slate-700",
};

/** Status badge, plus the outcome once the case is closed with one (cases closed before outcomes existed have none). */
function CaseBadges({ item }: { item: Case }) {
  const outcomeStyle = item.status === "kapali" ? OUTCOME_BADGE_STYLES[item.outcome] : undefined;
  return (
    <div role="group" aria-label="Dava durumu" className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700">{CASE_STATUS_LABELS[item.status]}</span>
      {outcomeStyle && (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcomeStyle}`}>{CASE_OUTCOME_LABELS[item.outcome]}</span>
      )}
    </div>
  );
}

interface Props {
  caseDetail: Case;
  actions: CaseAction[];
  busy: boolean;
  actionError: string | null;
  onPick: (action: CaseAction) => void;
}

export function CaseHeader({ caseDetail, actions, busy, actionError, onPick }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{caseDetail.case_number}</p>
          <h1 className="text-xl font-semibold text-navy-900">{caseDetail.case_name}</h1>
          <p className="text-sm text-navy-500">
            {caseDetail.client_name}
            {caseDetail.opposing_party ? ` vs. ${caseDetail.opposing_party}` : ""}
          </p>
        </div>
        <CaseActionsMenu actions={actions} busy={busy} onPick={onPick} />
      </div>
      <CaseBadges item={caseDetail} />
      {caseDetail.is_archived && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>Bu dava arşivlendi; salt okunur.</p>
          {actions.includes("unarchive") && (
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) onPick("unarchive");
              }}
              className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Arşivden çıkar
            </button>
          )}
        </div>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}
    </div>
  );
}
