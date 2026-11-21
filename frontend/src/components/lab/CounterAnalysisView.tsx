"use client";

import { useState } from "react";

import { runCounterAnalysis } from "@/lib/api";
import type { CaseRef, CounterAnalysis, Finding } from "@/types/legalLab";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { ErrorState } from "@/components/ErrorState";
import { CaseSource, LawChip, ModeBanner, PRIMARY_BTN, hasCase } from "@/components/lab/LabBits";

const STAGE_LABEL: Record<string, string> = {
  acilis: "Dava açılışı",
  cevap: "Cevap ve savunma",
  delil: "Delil toplama",
  bilirkisi: "Bilirkişi",
  karar: "Hüküm ve hesap",
  yol: "Kanun yolu",
};

const STAGE_ORDER = Object.keys(STAGE_LABEL);

export function CounterAnalysisView() {
  const [ref, setRef] = useState<CaseRef>({});
  const [side, setSide] = useState<"davaci" | "davali">("davaci");
  const [result, setResult] = useState<CounterAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await runCounterAnalysis(ref, side));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz çalıştırılamadı.");
    } finally {
      setBusy(false);
    }
  }

  const grouped = STAGE_ORDER.map((s) => ({ stage: s, items: (result?.findings ?? []).filter((f) => f.stage === s) })).filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <AiHero
        compact
        title="Karşı Taraf Analizi"
        description="Davayı karşı tarafın ve mahkemenin gözüyle tarar: aleyhinize kullanılabilecek açıklar ve lehinize meşru hamleler, kanun dayanağı ve Yargıtay bozma bağlamıyla."
      />

      <AiCard>
        <CaseSource value={ref} onChange={setRef} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Taraf" className="inline-flex rounded-xl border border-surface-border p-0.5">
            {(["davaci", "davali"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                className={`rounded-[10px] px-3 py-1.5 text-sm font-medium ${side === s ? "bg-accent-600 text-white" : "text-navy-600 hover:text-accent-800"}`}
              >
                {s === "davaci" ? "Davacı vekiliyiz" : "Davalı vekiliyiz"}
              </button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={busy || !hasCase(ref)} className={PRIMARY_BTN}>
            {busy ? "Analiz ediliyor…" : "Karşı tarafı analiz et"}
          </button>
        </div>
      </AiCard>

      {error && <ErrorState message={error} />}
      <ModeBanner mode={result?.mode} note={result?.note} />

      {grouped.map((g) => (
        <section key={g.stage} aria-label={STAGE_LABEL[g.stage]} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">{STAGE_LABEL[g.stage]}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.items.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        </section>
      ))}
      {result && (
        <p className="text-[11px] text-navy-500">
          Yapay zekâ tarafından üretilmiş tahmindir; kesin hukuki sonuç veya garanti değildir, avukat denetimi gerekir.
        </p>
      )}
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const risk = f.type === "risk";
  return (
    <article className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-navy-900">{f.title}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${risk ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {risk ? "Risk" : "Fırsat"} · {f.severity}/5
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-sm leading-6">
        <Row label="Olgu" text={f.fact} muted={!f.fact_ok} />
        <Row label="Kural" text={f.rule} />
        <Row label="Sonuç" text={f.inference} />
        <Row label="Yapılacak" text={f.action} strong />
      </dl>
      {f.basis.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {f.basis.map((b) => (
            <LawChip key={b.code} law={b} />
          ))}
        </div>
      )}
      {f.legitimacy === "sinirda" && <p className="mt-2 text-[11px] text-amber-700">Usulün kötüye kullanımı sınırında; dikkatle değerlendirin.</p>}
    </article>
  );
}

function Row({ label, text, muted, strong }: { label: string; text: string; muted?: boolean; strong?: boolean }) {
  if (!text) return null;
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className={`${muted ? "text-navy-400" : strong ? "font-medium text-navy-900" : "text-navy-700"}`}>{text}</dd>
    </div>
  );
}
