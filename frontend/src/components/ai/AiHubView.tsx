"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAiStatus, listAllSimulations, listCourtroomSessions } from "@/lib/api";
import {
  AI_PERSPECTIVES,
  AI_ROUTES,
  activeSession,
  courtroomSessionHref,
  latestSession,
  mergeRecentAiActivity,
} from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { AIStatus, CourtroomSessionSummary, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiMark } from "@/components/ai/AiMark";
import { AiModelStatus } from "@/components/ai/AiModelStatus";
import { ErrorState } from "@/components/ErrorState";

const PRIMARY = "rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700";

export function AiHubView() {
  const [simulations, setSimulations] = useState<SimulationWithCase[]>([]);
  const [sessions, setSessions] = useState<CourtroomSessionSummary[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllSimulations(), listCourtroomSessions()])
      .then(([simRows, sessionRows]) => {
        if (cancelled) return;
        setSimulations(simRows);
        setSessions(sessionRows);
      })
      .catch(() => {
        if (!cancelled) setError("AI verileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getAiStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const completedCount = simulations.filter((sim) => sim.status === "completed").length;
  const lastSession = latestSession(sessions);
  const liveSession = activeSession(sessions);
  const activity = mergeRecentAiActivity(simulations, sessions, 6);
  const pending = "…";

  return (
    <div className="space-y-6">
      <AiHero
        title="CaseBridge AI"
        description="Davalarınızı dört farklı perspektiften analiz edin, gerçekçi duruşma pratiği yapın."
        stats={[
          { label: "Tamamlanan analiz", value: loading ? pending : completedCount },
          { label: "Duruşma oturumu", value: loading ? pending : sessions.length },
          { label: "Son duruşma puanı", value: loading ? pending : lastSession?.total_score ?? "—" },
        ]}
      >
        <AiModelStatus status={aiStatus} variant="dark" />
      </AiHero>

      {error && <ErrorState message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <AiCard>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
            <AiMark className="h-3.5 w-3.5 text-accent-500" />
            Dosya Analizi
          </p>
          <h2 className="mt-2 text-lg font-semibold text-navy-900">Davanızı dört perspektiften değerlendirin</h2>
          <p className="mt-1 text-sm leading-6 text-navy-500">
            Güçlü ve zayıf yönler, karşı argümanlar, eksik bilgiler ve önerilen sonraki adımlar.
          </p>
          <ul aria-label="Perspektifler" className="mt-4 flex flex-wrap gap-2">
            {AI_PERSPECTIVES.map((perspective) => (
              <li key={perspective} className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
                {perspective}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-5">
            <Link href={AI_ROUTES.analysis} className={PRIMARY}>
              Analizi başlat
            </Link>
            <Link href={`${AI_ROUTES.analysis}#raporlar`} className="text-sm font-medium text-accent-700 hover:text-accent-800">
              Raporları gör
            </Link>
          </div>
        </AiCard>

        <AiCard>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
            <AiMark className="h-3.5 w-3.5 text-accent-500" />
            Canlı Duruşma
          </p>
          <h2 className="mt-2 text-lg font-semibold text-navy-900">Hâkim karşısında pratik yapın</h2>
          <p className="mt-1 text-sm leading-6 text-navy-500">
            Yerel model karşı taraf vekilini ve hâkimi oynar. 6 aşama · 100 puanlık değerlendirme.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-5">
            {liveSession ? (
              <Link href={courtroomSessionHref(liveSession.id)} className={PRIMARY}>
                Devam et: {liveSession.scenario_title}
              </Link>
            ) : (
              <Link href={AI_ROUTES.courtroom} className={PRIMARY}>
                Duruşmaya gir
              </Link>
            )}
          </div>
        </AiCard>
      </div>

      <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-navy-900">Son AI aktivitesi</h2>
        {!loading && activity.length === 0 ? (
          <p className="text-sm text-navy-500">Henüz AI aktivitesi yok.</p>
        ) : (
          <ul aria-label="Son AI aktivitesi" className="divide-y divide-surface-border">
            {activity.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent-700">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-navy-800">{item.title}</span>
                    <span className="block text-xs text-navy-500">{item.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-xs text-navy-400">{formatDate(item.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
