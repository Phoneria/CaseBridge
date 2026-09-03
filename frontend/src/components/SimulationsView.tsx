"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCourtroomSession,
  listAllSimulations,
  listCourtroomScenarios,
  listCourtroomSessions,
} from "@/lib/api";
import { formatDate } from "@/lib/labels";
import type {
  CourtroomRole,
  CourtroomScenario,
  CourtroomSessionSummary,
  SimulationWithCase,
} from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { SimulationResultCard } from "@/components/SimulationResultCard";

const DIFFICULTY = {
  beginner: { label: "Başlangıç", className: "bg-emerald-50 text-emerald-700" },
  intermediate: { label: "Orta", className: "bg-amber-50 text-amber-700" },
  advanced: { label: "İleri", className: "bg-rose-50 text-rose-700" },
};

const STATUS_LABEL = {
  active: "Devam ediyor",
  completed: "Tamamlandı",
  failed: "Yanıt bekliyor",
  abandoned: "Terk edildi",
};

function ScenarioCard({ scenario, busy, onStart }: {
  scenario: CourtroomScenario;
  busy: boolean;
  onStart: (role: CourtroomRole) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const difficulty = DIFFICULTY[scenario.difficulty];

  return (
    <article className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700">{scenario.category}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${difficulty.className}`}>{difficulty.label}</span>
      </div>
      <h2 className="text-base font-semibold text-navy-900">{scenario.title}</h2>
      <p className="mt-1 text-xs font-medium text-navy-600">{scenario.plaintiff_name} <span className="text-navy-400">/</span> {scenario.defendant_name}</p>
      <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{scenario.summary}</p>
      <div className="mt-4 flex items-center gap-4 border-t border-surface-border pt-4 text-xs text-navy-500">
        <span>{scenario.estimated_rounds} aşama</span>
        <button type="button" className="font-medium text-accent-700 hover:text-accent-800" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Detayı gizle" : "Davayı incele"}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4 text-xs leading-5 text-navy-600">
          <div>
            <p className="font-semibold text-navy-800">Tartışılacak konular</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{scenario.disputed_issues.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold text-navy-800">Bu çalışmada</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{scenario.learning_objectives.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => onStart("plaintiff")} className="rounded-xl bg-accent-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">
          {busy ? "Hazırlanıyor…" : "Davacı ol"}
        </button>
        <button type="button" disabled={busy} onClick={() => onStart("defendant")} className="rounded-xl border border-surface-border px-3 py-2.5 text-sm font-semibold text-navy-700 hover:bg-surface-muted disabled:opacity-50">
          Davalı ol
        </button>
      </div>
    </article>
  );
}

export function SimulationsView() {
  const router = useRouter();
  const [tab, setTab] = useState<"courtroom" | "analysis">("courtroom");
  const [scenarios, setScenarios] = useState<CourtroomScenario[]>([]);
  const [sessions, setSessions] = useState<CourtroomSessionSummary[]>([]);
  const [simulations, setSimulations] = useState<SimulationWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listCourtroomScenarios(), listCourtroomSessions(), listAllSimulations()])
      .then(([scenarioRows, sessionRows, analysisRows]) => {
        setScenarios(scenarioRows);
        setSessions(sessionRows);
        setSimulations(analysisRows);
      })
      .catch(() => setError("Simülasyonlar yüklenemedi. Backend ve yerel model ayarlarını kontrol edin."))
      .finally(() => setLoading(false));
  }, []);

  async function start(scenarioId: string, role: CourtroomRole) {
    setCreatingId(scenarioId);
    setError(null);
    try {
      const session = await createCourtroomSession(scenarioId, role);
      router.push(`/simulasyonlar/oturum/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oturum başlatılamadı.");
      setCreatingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error && scenarios.length === 0) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Eğitim alanı</p>
          <h1 className="mt-1 text-2xl font-semibold text-navy-900">Duruşma Simülasyonları</h1>
          <p className="mt-1 max-w-2xl text-sm text-navy-500">Bir taraf seç, delillerini kullan ve yerel AI karşısında hâkimi ikna etmeye çalış.</p>
        </div>
        <div className="flex rounded-xl border border-surface-border bg-white p-1">
          <button type="button" onClick={() => setTab("courtroom")} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "courtroom" ? "bg-navy-900 text-white" : "text-navy-500"}`}>Canlı duruşma</button>
          <button type="button" onClick={() => setTab("analysis")} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "analysis" ? "bg-navy-900 text-white" : "text-navy-500"}`}>Dosya analizleri</button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {tab === "courtroom" ? (
        <>
          {sessions.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-navy-900">Oturumlarım</h2>
                <span className="text-xs text-navy-500">{sessions.length} oturum</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sessions.slice(0, 6).map((session) => (
                  <button key={session.id} type="button" onClick={() => router.push(`/simulasyonlar/oturum/${session.id}`)} className="rounded-2xl border border-surface-border bg-white p-4 text-left shadow-card transition hover:border-accent-200">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-navy-900">{session.scenario_title}</p>
                      {session.total_score !== null && <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-bold text-accent-700">{session.total_score}/100</span>}
                    </div>
                    <p className="mt-2 text-xs text-navy-500">{session.chosen_role === "plaintiff" ? "Davacı vekili" : "Davalı vekili"} · {STATUS_LABEL[session.status]} · {formatDate(session.updated_at)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-navy-900">Bir örnek dava seç</h2>
            {scenarios.length === 0 ? (
              <EmptyState message="Henüz duruşma senaryosu yok." hint="Backend seed komutunu çalıştırın." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {scenarios.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} busy={creatingId === scenario.id} onStart={(role) => start(scenario.id, role)} />)}
              </div>
            )}
          </section>
        </>
      ) : simulations.length === 0 ? (
        <EmptyState message="Henüz dosya analizi yok." hint="Analizler bir davanın Simülasyonlar sekmesinden başlatılır." />
      ) : (
        <div className="space-y-4">
          {simulations.map((sim) => (
            <div key={sim.id} className="space-y-2">
              <p className="text-xs font-medium text-navy-500">{sim.case_number} - {sim.case_name} - {formatDate(sim.started_at)}</p>
              {sim.result ? <SimulationResultCard result={sim.result} /> : <div className="rounded-2xl border border-surface-border bg-white p-4 text-sm text-navy-600 shadow-card">Simülasyon durumu: {sim.status}{sim.error_message ? ` — ${sim.error_message}` : ""}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
