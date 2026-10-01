"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createCourtroomSession, listCourtroomScenarios, listCourtroomSessions } from "@/lib/api";
import { COURTROOM_ROLE_LABELS, COURTROOM_STATUS_LABELS, bestScore, courtroomSessionHref } from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { CourtroomRole, CourtroomScenario, CourtroomSessionSummary } from "@/types";
import { AiHero } from "@/components/ai/AiHero";
import { ScenarioCard } from "@/components/ai/ScenarioCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";

function sortSessions(sessions: CourtroomSessionSummary[]): CourtroomSessionSummary[] {
  return [...sessions].sort((a, b) => {
    const activeFirst = Number(b.status === "active") - Number(a.status === "active");
    if (activeFirst !== 0) return activeFirst;
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  });
}

export function CourtroomLobbyView() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<CourtroomScenario[]>([]);
  const [sessions, setSessions] = useState<CourtroomSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCourtroomScenarios(), listCourtroomSessions()])
      .then(([scenarioRows, sessionRows]) => {
        if (cancelled) return;
        setScenarios(scenarioRows);
        setSessions(sessionRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Canlı duruşma verileri yüklenemedi. Backend ve yerel model ayarlarını kontrol edin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start(scenarioId: string, role: CourtroomRole) {
    setCreatingId(scenarioId);
    setStartError(null);
    try {
      const session = await createCourtroomSession(scenarioId, role);
      router.push(courtroomSessionHref(session.id));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Oturum başlatılamadı.");
      setCreatingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const best = bestScore(sessions);
  const sorted = sortSessions(sessions).slice(0, 6);

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Canlı Duruşma"
        description="Bir taraf seç, delillerini kullan ve yerel AI'ın oynadığı karşı taraf vekili ile hâkim karşısında davanı savun."
        stats={[
          { label: "Oturum", value: sessions.length },
          { label: "En yüksek puan", value: best ?? "—" },
        ]}
      />

      {startError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {startError}
        </div>
      )}

      {sorted.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900">Oturumlarım</h2>
            <span className="text-xs text-navy-500">{sessions.length} oturum</span>
          </div>
          <ul aria-label="Oturumlarım" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((session) => {
              const live = session.status === "active";
              return (
                <li key={session.id}>
                  <Link
                    href={courtroomSessionHref(session.id)}
                    className={`block h-full rounded-2xl border bg-white p-4 shadow-card transition hover:border-accent-300 ${
                      live ? "border-accent-300 ring-1 ring-accent-200" : "border-surface-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-navy-900">{session.scenario_title}</p>
                      {session.total_score !== null && (
                        <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-bold text-accent-700">{session.total_score}/100</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-navy-500">
                      {COURTROOM_ROLE_LABELS[session.chosen_role]} · {COURTROOM_STATUS_LABELS[session.status]} · {formatDate(session.updated_at)}
                    </p>
                    {live && <p className="mt-3 text-xs font-semibold text-accent-700">Devam et →</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-navy-900">Bir örnek dava seç</h2>
        {scenarios.length === 0 ? (
          <EmptyState message="Henüz duruşma senaryosu yok." hint="Backend seed komutunu çalıştırın." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                busy={creatingId === scenario.id}
                onStart={(role) => start(scenario.id, role)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
