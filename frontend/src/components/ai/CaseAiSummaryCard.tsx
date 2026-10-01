import { AiCard } from "@/components/ai/AiCard";
import { AiMark } from "@/components/ai/AiMark";
import { AiBrand } from "@/components/ai/AiBrand";
import { CONFIDENCE_LABELS, analysisDate, isAnalysisInProgress, latestCompletedAnalysis } from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { Simulation } from "@/types";

const PRIMARY = "rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60";
const SECONDARY = "rounded-xl border border-accent-200 px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60";

export function CaseAiSummaryCard({
  simulations,
  running,
  onStart,
  onOpenReport,
}: {
  simulations: Simulation[];
  running: boolean;
  onStart: () => void;
  onOpenReport: () => void;
}) {
  const latest = latestCompletedAnalysis(simulations);
  const inProgress = running || isAnalysisInProgress(simulations);

  return (
    <AiCard disclaimer={latest && !inProgress ? latest.result?.ai_disclaimer : undefined}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
        <AiMark className="h-3.5 w-3.5 text-accent-500" />
        <AiBrand /> · Dosya Analizi
      </p>

      {inProgress ? (
        <div role="status" className="mt-4 flex items-center gap-3 text-sm text-navy-700">
          <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-accent-100">
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent-500 motion-reduce:animate-none" />
          </span>
          Analiz sürüyor…
        </div>
      ) : latest?.result ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-navy-500">Son AI değerlendirmesi</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-accent-700">%{latest.result.assessment.score}</span>
              <span className="text-xs text-navy-500">{CONFIDENCE_LABELS[latest.result.assessment.confidence]}</span>
              <span className="text-xs text-navy-400">{formatDate(analysisDate(latest))}</span>
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-navy-600">{latest.result.summary}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onOpenReport} className={PRIMARY}>
              Raporu aç
            </button>
            <button type="button" onClick={onStart} className={SECONDARY}>
              Yeniden analiz et
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-navy-600">
            Hakim, davacı vekili, davalı vekili ve araştırmacı perspektiflerinden karar destek analizi üretin.
          </p>
          <button type="button" onClick={onStart} className={`${PRIMARY} shrink-0`}>
            Analizi başlat
          </button>
        </div>
      )}
    </AiCard>
  );
}
