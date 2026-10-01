"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAiStatus, getCases, listAllSimulations, startSimulation } from "@/lib/api";
import { caseDetailHref } from "@/lib/filters";
import { SIMULATION_STATUS_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { AIStatus, Case, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiModelStatus } from "@/components/ai/AiModelStatus";
import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { SimulationResultCard } from "@/components/SimulationResultCard";

export function AnalysisView() {
  const router = useRouter();
  const { params } = useUrlParams();
  const quickViewHref = useQuickViewHref();

  const [cases, setCases] = useState<Case[]>([]);
  const [simulations, setSimulations] = useState<SimulationWithCase[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => params.get("dava"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCases({ active: true }), listAllSimulations()])
      .then(([caseRows, simRows]) => {
        if (cancelled) return;
        setCases(caseRows);
        setSimulations(simRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Dosya analizi verileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
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

  // The reports section only exists after loading, so honour a #hash deep link then.
  useEffect(() => {
    if (loading || loadError) return;
    const hash = window.location.hash;
    if (hash.length > 1) document.getElementById(hash.slice(1))?.scrollIntoView?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function start() {
    if (!selectedCaseId) return;
    setStarting(true);
    setStartError(null);
    try {
      await startSimulation(selectedCaseId);
      router.push(caseDetailHref(selectedCaseId, "ai"));
    } catch {
      setStartError("Analiz başlatılamadı. Lütfen tekrar deneyin.");
      setStarting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const reports = [...simulations].sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Dosya Analizi"
        description="Bir dava seçin; CaseBridge AI davayı hakim, davacı vekili, davalı vekili ve araştırmacı gözüyle değerlendirsin."
        stats={[{ label: "Analiz", value: simulations.length }]}
      />

      <AiCard id="yeni">
        <h2 className="text-base font-semibold text-navy-900">Yeni analiz</h2>
        {aiStatus && !aiStatus.configured && <AiModelStatus status={aiStatus} variant="light" />}
        <div className="mt-4">
          <CaseSearchSelect cases={cases} value={selectedCaseId} onChange={setSelectedCaseId} />
        </div>
        {startError && <p role="alert" className="mt-3 text-sm text-rose-700">{startError}</p>}
        <div className="mt-4">
          <button
            type="button"
            onClick={start}
            disabled={!selectedCaseId || starting}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {starting ? "Başlatılıyor…" : "Analizi başlat"}
          </button>
        </div>
      </AiCard>

      <section id="raporlar" aria-labelledby="raporlar-baslik" className="space-y-4">
        <h2 id="raporlar-baslik" className="text-sm font-semibold text-navy-900">
          Raporlar
        </h2>
        {reports.length === 0 ? (
          <EmptyState message="Henüz dosya analizi yok." hint="Yukarıdan bir dava seçerek ilk analizi başlatın." />
        ) : (
          reports.map((sim) => (
            <div key={sim.id} className="space-y-2">
              <p className="text-xs font-medium text-navy-500">
                <Link href={quickViewHref(sim.case_id)} scroll={false} className="hover:text-accent-700 hover:underline">
                  {sim.case_number} - {sim.case_name}
                </Link>{" "}
                - {formatDate(sim.started_at)}
              </p>
              {sim.result ? (
                <SimulationResultCard result={sim.result} />
              ) : (
                <div className="rounded-2xl border border-surface-border bg-white p-4 text-sm text-navy-600 shadow-card">
                  {SIMULATION_STATUS_LABELS[sim.status] ?? sim.status}
                  {sim.error_message ? ` — ${sim.error_message}` : ""}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
