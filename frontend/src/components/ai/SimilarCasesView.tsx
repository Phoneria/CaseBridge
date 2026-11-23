"use client";

import { useEffect, useRef, useState } from "react";

import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { SimilarCaseList } from "@/components/similar/SimilarCaseList";
import { getCases, getSimilarCases, searchSimilarCases } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { CASE_TYPE_LABELS } from "@/lib/labels";
import type { Case, CaseType, SimilarCase } from "@/types";

type Mode = "case" | "text";
const LIMIT = 10;

/** CaseBridge AI → Benzer Dava Bul: pick a case or describe a dispute; results use the case card's list. */
export function SimilarCasesView({ initialCaseId }: { initialCaseId?: string }) {
  const [mode, setMode] = useState<Mode>("case");
  const [cases, setCases] = useState<Case[]>([]);
  const [casesFailed, setCasesFailed] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(initialCaseId ?? null);
  const [text, setText] = useState("");
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [results, setResults] = useState<SimilarCase[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    getCases({ include_archived: true }).then(setCases).catch(() => setCasesFailed(true));
    return () => { revision.current++; };
  }, []);

  async function run(load: () => Promise<SimilarCase[]>) {
    const current = ++revision.current;
    setBusy(true); setMessage(""); setResults(null);
    try {
      const rows = await load();
      if (current === revision.current) setResults(rows);
    } catch (err) {
      if (current === revision.current) setMessage(err instanceof ApiError && err.status === 404 ? "Dava bulunamadı." : "Benzer davalar getirilemedi. Tekrar deneyin.");
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (mode === "case" && caseId) void run(() => getSimilarCases(caseId, LIMIT));
  }, [mode, caseId]);

  function switchMode(next: Mode) {
    revision.current++;
    setMode(next); setResults(null); setMessage(""); setBusy(false);
  }

  const selected = cases.find((c) => c.id === caseId);
  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-accent-50 text-accent-800" : "text-navy-700 hover:bg-surface-muted"}`;

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Benzer Dava Bul</h1>
        <p className="mt-2 text-sm text-navy-600">
          Büronuzun davaları (arşivlenmiş ve kapanmış olanlar dahil) ve emsal arşivi içinde benzer dosyaları bulur. Kategori, mahkeme türü,
          müvekkil rolü, dava değeri ve metin benzerliği kullanılır; yapay zekâ çağrısı yapılmaz ve metin kaydedilmez.
        </p>
      </header>

      <div role="tablist" aria-label="Arama yöntemi" className="inline-flex gap-1 rounded-xl border border-surface-border bg-white p-1">
        <button type="button" role="tab" aria-selected={mode === "case"} onClick={() => switchMode("case")} className={tabClass(mode === "case")}>Davaya göre</button>
        <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => switchMode("text")} className={tabClass(mode === "text")}>Metinle ara</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-2xl border border-surface-border bg-white p-4 shadow-card">
          {mode === "case" ? (
            casesFailed ? (
              <p role="alert" className="text-sm text-navy-700">Davalar yüklenemedi.</p>
            ) : (
              <CaseSearchSelect cases={cases} value={caseId} onChange={setCaseId} />
            )
          ) : (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (text.trim()) void run(() => searchSimilarCases(text.trim(), caseType || null, LIMIT)); }}>
              <div className="space-y-1">
                <label htmlFor="similar-text" className="block text-xs font-medium text-navy-600">Uyuşmazlığı anlatın</label>
                <textarea
                  id="similar-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={8}
                  maxLength={20000}
                  placeholder="Ör. Kiracı yeni dönem kira bedelini eski bedel üzerinden ödüyor; kira farkı ve tespit talebi."
                  className="w-full rounded-xl border border-surface-border bg-white p-3 text-sm text-navy-800 outline-none focus:border-accent-400"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="similar-type" className="block text-xs font-medium text-navy-600">Kategori (isteğe bağlı)</label>
                <select
                  id="similar-type"
                  value={caseType}
                  onChange={(event) => setCaseType(event.target.value as CaseType | "")}
                  className="w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800"
                >
                  <option value="">Tüm kategoriler</option>
                  {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-accent-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Aranıyor…" : "Benzer davaları bul"}
              </button>
            </form>
          )}
        </div>

        <div aria-busy={busy} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-navy-800">
            {mode === "case" && selected ? `${selected.case_name} için benzer davalar` : "Sonuçlar"}
          </h2>
          {message ? (
            <p role="alert" className="text-sm text-navy-700">{message}</p>
          ) : busy ? (
            <p role="status" className="text-sm text-navy-500">Benzer davalar aranıyor…</p>
          ) : results === null ? (
            <p className="text-sm text-navy-500">{mode === "case" ? "Soldan bir dava seçin." : "Uyuşmazlığı yazıp aramayı başlatın."}</p>
          ) : (
            <SimilarCaseList
              items={results}
              emptyMessage="Benzer dava bulunamadı."
              emptyHint={mode === "text" ? "Talebi ve olayları biraz daha ayrıntılı yazmayı deneyin." : "Seçili davanın talep ve olay özetini doldurmak eşleşmeyi iyileştirir."}
            />
          )}
        </div>
      </div>
      <p className="text-xs text-navy-500">Benzerlik puanı bir karar tahmini değildir; sonuçlar avukat incelemesi için başlangıç noktasıdır.</p>
    </section>
  );
}
