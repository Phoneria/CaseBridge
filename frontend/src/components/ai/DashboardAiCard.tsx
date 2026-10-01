"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listAllSimulations, listCourtroomSessions } from "@/lib/api";
import {
  AI_ROUTES,
  CONFIDENCE_LABELS,
  COURTROOM_STATUS_LABELS,
  analysisDate,
  courtroomSessionHref,
  latestCompletedAnalysis,
  latestSession,
} from "@/lib/ai";
import { caseDetailHref } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import type { CourtroomSessionSummary, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiMark } from "@/components/ai/AiMark";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; simulations: SimulationWithCase[]; sessions: CourtroomSessionSummary[] };

/** Fetches its own data so an AI failure never breaks the rest of the dashboard. */
export function DashboardAiCard() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllSimulations(), listCourtroomSessions()])
      .then(([simulations, sessions]) => {
        if (!cancelled) setState({ kind: "ready", simulations, sessions });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analysis = state.kind === "ready" ? latestCompletedAnalysis(state.simulations) : null;
  const session = state.kind === "ready" ? latestSession(state.sessions) : null;

  return (
    <AiCard>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <AiMark className="h-4 w-4 text-accent-500" />
          CaseBridge AI
        </p>
        <Link href={AI_ROUTES.hub} className="text-xs font-medium text-accent-700 hover:text-accent-800">
          Tümü →
        </Link>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-3">
        {state.kind === "error" ? (
          <p role="alert" className="text-sm text-navy-500 md:col-span-2">
            AI verileri yüklenemedi.
          </p>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Son dosya analizi</p>
              {state.kind === "loading" ? (
                <p className="mt-2 text-sm text-navy-400">…</p>
              ) : analysis?.result ? (
                <div className="mt-2 space-y-1">
                  <p className="truncate text-sm font-medium text-navy-800">{analysis.case_name}</p>
                  <p className="flex items-baseline gap-2">
                    <span className="text-xl font-semibold text-accent-700">%{analysis.result.assessment.score}</span>
                    <span className="text-xs text-navy-500">{CONFIDENCE_LABELS[analysis.result.assessment.confidence]}</span>
                  </p>
                  <p className="text-xs text-navy-400">{formatDate(analysisDate(analysis))}</p>
                  <Link href={caseDetailHref(analysis.case_id, "ai")} className="text-xs font-medium text-accent-700 hover:text-accent-800">
                    Raporu aç
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-navy-500">Henüz analiz yok.</p>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Son duruşma</p>
              {state.kind === "loading" ? (
                <p className="mt-2 text-sm text-navy-400">…</p>
              ) : session ? (
                <div className="mt-2 space-y-1">
                  <p className="truncate text-sm font-medium text-navy-800">{session.scenario_title}</p>
                  <p className="text-xl font-semibold text-accent-700">
                    {session.total_score !== null ? `${session.total_score}/100` : COURTROOM_STATUS_LABELS[session.status]}
                  </p>
                  <p className="text-xs text-navy-400">{formatDate(session.updated_at)}</p>
                  <Link href={courtroomSessionHref(session.id)} className="text-xs font-medium text-accent-700 hover:text-accent-800">
                    Oturumu aç
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-navy-500">Henüz oturum yok.</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 md:col-start-3">
          <Link
            href={AI_ROUTES.analysis}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
          >
            <AiMark className="h-4 w-4 text-white" />
            Dosya analizi başlat
          </Link>
          <Link
            href={AI_ROUTES.courtroom}
            className="inline-flex items-center justify-center rounded-xl border border-accent-200 px-4 py-2.5 text-sm font-semibold text-accent-700 hover:bg-accent-50"
          >
            Duruşmaya gir
          </Link>
        </div>
      </div>
    </AiCard>
  );
}
