"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createCourtroomSession, createCourtroomSessionFromCase, getCases, listCourtroomScenarios, listCourtroomSessions } from "@/lib/api";
import { COURTROOM_ROLE_LABELS, COURTROOM_STATUS_LABELS, bestScore, courtroomSessionHref } from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { Case, CourtroomRole, CourtroomScenario, CourtroomSessionSummary } from "@/types";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [caseId, setCaseId] = useState("");
  const [caseRole, setCaseRole] = useState<CourtroomRole>("plaintiff");
  const [caseSearch, setCaseSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCourtroomScenarios(), listCourtroomSessions()])
      .then(([scenarioRows, sessionRows]) => {
        if (cancelled) return;
        setScenarios(scenarioRows);
        setSessions(sessionRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Canlı duruşma verileri yüklenemedi. Bağlantıyı ve hizmet ayarlarını kontrol edin.");
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
    } catch {
      setStartError("Oturum başlatılamadı.");
      setCreatingId(null);
    }
  }

  async function openCasePicker() {
    setStartError(null);
    setPickerOpen(true);
    try {
      const rows = (await getCases({ include_archived: true })).filter((item) => !item.is_precedent);
      setCases(rows);
      setCaseId(rows[0]?.id || "");
    } catch {
      setStartError("Dava listesi yüklenemedi.");
    }
  }

  async function startFromCase() {
    if (!caseId || !filteredCases.some((item) => item.id === caseId)) return;
    setCreatingId(caseId);
    setStartError(null);
    try {
      const session = await createCourtroomSessionFromCase(caseId, caseRole);
      router.push(courtroomSessionHref(session.id));
    } catch {
      setStartError("Seçilen davadan duruşma başlatılamadı.");
      setCreatingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const examples = sortSessions(sessions.filter((session) => session.is_demo));
  const personal = sortSessions(sessions.filter((session) => !session.is_demo));
  const best = bestScore(personal);
  const filteredCases = cases.filter((item) => `${item.case_number} ${item.case_name} ${item.client_name}`.toLocaleLowerCase("tr-TR").includes(caseSearch.toLocaleLowerCase("tr-TR")));

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Canlı Duruşma"
        description="Bir taraf seç, delillerini kullan ve yerel AI'ın oynadığı karşı taraf vekili ile hâkim karşısında davanı savun."
        stats={[
          { label: "Oturumlarım", value: personal.length },
          { label: "En yüksek puan", value: best ?? "—" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-200 bg-white p-4 shadow-card">
        <div><p className="text-sm font-semibold text-navy-900">Kendi davanızla prova yapın</p><p className="mt-1 text-xs text-navy-500">Kayıtlı davayı ve temsil edeceğiniz tarafı seçin; gerçek duruşma değil, eğitim oturumu başlar.</p></div>
        <button type="button" onClick={openCasePicker} className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-700">+ Duruşma ekle</button>
      </div>

      {startError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {startError}
        </div>
      )}

      {pickerOpen && (
        <section role="dialog" aria-modal="true" aria-label="Duruşma ekle" className="rounded-2xl border border-accent-200 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-navy-900">Duruşma ekle</h2><button type="button" onClick={() => setPickerOpen(false)} aria-label="Kapat" className="text-navy-500 hover:text-navy-900">✕</button></div>
          <p className="mt-1 text-sm text-navy-500">Dava kaydındaki bilgiler kullanılır. Eksik belge veya olay gerçekmiş gibi tamamlanmaz.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div><label htmlFor="courtroom-case-search" className="text-xs font-semibold text-navy-700">Dava ara</label><input id="courtroom-case-search" value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="Dosya no, dava veya müvekkil" className="mt-1 w-full rounded-xl border border-surface-border px-3 py-2 text-sm" /></div>
            <div><label htmlFor="courtroom-role" className="text-xs font-semibold text-navy-700">Müvekkilin tarafı</label><select id="courtroom-role" value={caseRole} onChange={(event) => setCaseRole(event.target.value as CourtroomRole)} className="mt-1 w-full rounded-xl border border-surface-border px-3 py-2 text-sm"><option value="plaintiff">Davacı</option><option value="defendant">Davalı</option></select></div>
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Dava seç">
            {filteredCases.map((item) => <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${caseId === item.id ? "border-accent-400 bg-accent-50" : "border-surface-border"}`}><input type="radio" name="courtroom-case" checked={caseId === item.id} onChange={() => setCaseId(item.id)} /><span><strong className="block text-navy-900">{item.case_number} · {item.case_name}</strong><span className="text-xs text-navy-500">{item.client_name} / {item.opposing_party || "Karşı taraf belirtilmemiş"}</span></span></label>)}
            {filteredCases.length === 0 && <p className="py-4 text-sm text-navy-500">Eşleşen dava yok.</p>}
          </div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={startFromCase} disabled={!filteredCases.some((item) => item.id === caseId) || Boolean(creatingId)} className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{creatingId === caseId ? "Başlatılıyor…" : "Duruşmayı başlat"}</button></div>
        </section>
      )}

      {examples.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-navy-900">Tamamlanmış örnek duruşmalar</h2><span className="text-xs text-navy-500">{examples.length} kurgusal eğitim oturumu</span></div>
          <ul aria-label="Tamamlanmış örnek duruşmalar" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{examples.map((session) => <li key={session.id}><Link href={courtroomSessionHref(session.id)} className="block h-full rounded-2xl border border-accent-200 bg-white p-4 shadow-card transition hover:border-accent-400"><span className="rounded-full bg-accent-50 px-2 py-1 text-[10px] font-bold text-accent-700">EĞİTİM ÖRNEĞİ · TAMAMLANDI</span><p className="mt-3 text-sm font-semibold text-navy-900">{session.scenario_title}</p><p className="mt-2 text-xs text-navy-500">Üç rolün konuşmaları, tutanak ve kurgusal sonuç hazır</p><p className="mt-3 text-xs font-semibold text-accent-700">Tutanağı incele →</p></Link></li>)}</ul>
        </section>
      )}

      {personal.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900">Oturumlarım</h2>
            <span className="text-xs text-navy-500">{personal.length} oturum</span>
          </div>
          <ul aria-label="Oturumlarım" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {personal.map((session) => {
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
