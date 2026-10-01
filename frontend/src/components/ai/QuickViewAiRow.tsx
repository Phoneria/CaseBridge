"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listSimulations } from "@/lib/api";
import { analysisDate, analysisStartHref, latestCompletedAnalysis } from "@/lib/ai";
import { caseDetailHref } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import type { Simulation } from "@/types";
import { AiBadge } from "@/components/ai/AiBadge";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; latest: Simulation | null };

/** Fetches separately so an AI failure never affects the rest of the quick view. */
export function QuickViewAiRow({ caseId }: { caseId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    listSimulations(caseId)
      .then((sims) => {
        if (!cancelled) setState({ kind: "ready", latest: latestCompletedAnalysis(sims) });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (state.kind !== "ready") return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-50/60 px-3 py-2 text-xs ring-1 ring-accent-100">
      <span className="flex min-w-0 items-center gap-2 text-navy-700">
        <AiBadge />
        {state.latest?.result ? (
          <span className="truncate">
            Son AI tahmini: %{state.latest.result.assessment.score} · {formatDate(analysisDate(state.latest))}
          </span>
        ) : (
          <span>Henüz AI analizi yok</span>
        )}
      </span>
      {state.latest?.result ? (
        <Link href={caseDetailHref(caseId, "ai")} className="shrink-0 font-semibold text-accent-700 hover:text-accent-800">
          Analize git
        </Link>
      ) : (
        <Link href={analysisStartHref(caseId)} className="shrink-0 font-semibold text-accent-700 hover:text-accent-800">
          Analiz başlat
        </Link>
      )}
    </div>
  );
}
