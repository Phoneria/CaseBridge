"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { explainPrecedents, getPrecedent, getPrecedentStatus, searchPrecedents } from "@/lib/api";
import type {
  CaseRef,
  PrecedentExplanation,
  PrecedentFilters,
  PrecedentItem,
  PrecedentKind,
  PrecedentSearchResult,
  PrecedentStatus,
} from "@/types/legalLab";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { ErrorState } from "@/components/ErrorState";
import { CaseSource, GHOST_BTN, ModeBanner, PRIMARY_BTN, hasCase } from "@/components/lab/LabBits";

const KINDS: { id: PrecedentKind; label: string }[] = [
  { id: "yargitay", label: "Yargıtay" },
  { id: "bam", label: "İstinaf (BAM)" },
  { id: "ilk_derece", label: "İlk derece" },
];

const OUTCOMES: { id: string; label: string }[] = [
  { id: "bozma", label: "Bozma" },
  { id: "onama", label: "Onama" },
  { id: "kabul", label: "Kabul" },
  { id: "kismen_kabul", label: "Kısmen kabul" },
  { id: "ret", label: "Ret" },
];

const OUTCOME_TONE: Record<string, string> = {
  bozma: "bg-red-50 text-red-700 ring-red-100",
  kaldirma: "bg-red-50 text-red-700 ring-red-100",
  onama: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  duzelterek_onama: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  istinaf_ret: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  kabul: "bg-sky-50 text-sky-700 ring-sky-100",
  kismen_kabul: "bg-amber-50 text-amber-800 ring-amber-100",
  ret: "bg-slate-100 text-slate-700 ring-slate-200",
  usul_ret: "bg-slate-100 text-slate-700 ring-slate-200",
  iade: "bg-amber-50 text-amber-800 ring-amber-100",
  duzelterek: "bg-amber-50 text-amber-800 ring-amber-100",
  belirsiz: "bg-navy-50 text-navy-500 ring-navy-100",
};

const BAR_TONE: Record<string, string> = {
  bozma: "bg-red-400",
  kaldirma: "bg-red-400",
  onama: "bg-emerald-400",
  duzelterek_onama: "bg-emerald-300",
  istinaf_ret: "bg-emerald-400",
  kabul: "bg-sky-400",
  kismen_kabul: "bg-amber-400",
  ret: "bg-slate-400",
  usul_ret: "bg-slate-300",
  iade: "bg-amber-300",
  duzelterek: "bg-amber-300",
  belirsiz: "bg-navy-200",
};

function OutcomeBadge({ item }: { item: Pick<PrecedentItem, "outcome" | "outcome_label"> }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${OUTCOME_TONE[item.outcome] ?? OUTCOME_TONE.belirsiz}`}>
      {item.outcome_label}
    </span>
  );
}

function modeLabel(s: PrecedentStatus | null): { text: string; tone: string } {
  if (!s) return { text: "Yükleniyor…", tone: "bg-navy-50 text-navy-500" };
  if (s.mode === "hybrid") return { text: `Anlamsal + kelime arama · ${s.indexed.toLocaleString("tr-TR")} karar`, tone: "bg-emerald-50 text-emerald-700" };
  if (s.mode === "lexical") return { text: `Kelime tabanlı arama · ${s.indexed.toLocaleString("tr-TR")} karar`, tone: "bg-sky-50 text-sky-700" };
  return { text: `Örnek veri · ${s.indexed} karar`, tone: "bg-amber-50 text-amber-800" };
}

export function EmsalView() {
  const [ref, setRef] = useState<CaseRef>({});
  const [status, setStatus] = useState<PrecedentStatus | null>(null);
  const [filters, setFilters] = useState<PrecedentFilters>({ kinds: [], outcomes: [] });
  const [result, setResult] = useState<PrecedentSearchResult | null>(null);
  const [explain, setExplain] = useState<Record<string, PrecedentExplanation>>({});
  const [explainMode, setExplainMode] = useState<{ mode: "mock" | "ai"; note: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getPrecedentStatus().then(setStatus).catch(() => {});
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setExplain({});
    setExplainMode(null);
    try {
      setResult(await searchPrecedents(ref, { k: 12, filters }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arama yapılamadı.");
    } finally {
      setBusy(false);
    }
  }, [ref, filters]);

  async function runExplain() {
    if (!result) return;
    setExplaining(true);
    try {
      const r = await explainPrecedents(ref, result.query, result.results.slice(0, 8).map((x) => x.doc_id));
      setExplain(Object.fromEntries(r.explanations.map((e) => [e.doc_id, e])));
      setExplainMode({ mode: r.mode, note: r.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Açıklama alınamadı.");
    } finally {
      setExplaining(false);
    }
  }

  function toggle<K extends "kinds" | "outcomes">(key: K, value: string) {
    setFilters((f) => {
      const cur = f[key] as string[];
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      return { ...f, [key]: next } as PrecedentFilters;
    });
  }

  const mode = modeLabel(status);

  return (
    <div className="space-y-5">
      <AiHero
        compact
        title="Emsal Karar Bul"
        description="Davanızı anlatın ya da büronuzdaki bir davayı seçin; Yargıtay, istinaf ve ilk derece kararları arasından olayı en çok andıranları sonuçlarıyla birlikte getirir."
      />

      <AiCard>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-medium ${mode.tone}`}>{mode.text}</span>
          {status?.mode === "hybrid" && status.model && <span className="text-navy-400">model: {status.model}</span>}
        </div>
        <CaseSource value={ref} onChange={setRef} />

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <FilterGroup label="Karar türü">
            {KINDS.map((k) => (
              <Chip key={k.id} active={filters.kinds.includes(k.id)} onClick={() => toggle("kinds", k.id)}>
                {k.label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Sonuç">
            {OUTCOMES.map((o) => (
              <Chip key={o.id} active={filters.outcomes.includes(o.id)} onClick={() => toggle("outcomes", o.id)}>
                {o.label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Yıl">
            <input
              aria-label="En erken yıl"
              inputMode="numeric"
              placeholder="2017"
              value={filters.year_min ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, year_min: e.target.value ? Number(e.target.value.replace(/\D/g, "").slice(0, 4)) : null }))}
              className="w-16 rounded-lg border border-surface-border px-2 py-1 text-sm outline-none focus:border-accent-400"
            />
            <span className="text-navy-400">–</span>
            <input
              aria-label="En geç yıl"
              inputMode="numeric"
              placeholder="2026"
              value={filters.year_max ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, year_max: e.target.value ? Number(e.target.value.replace(/\D/g, "").slice(0, 4)) : null }))}
              className="w-16 rounded-lg border border-surface-border px-2 py-1 text-sm outline-none focus:border-accent-400"
            />
          </FilterGroup>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={busy || !hasCase(ref)} className={PRIMARY_BTN}>
            {busy ? "Aranıyor…" : "Emsal karar bul"}
          </button>
          {(filters.kinds.length > 0 || filters.outcomes.length > 0 || filters.year_min || filters.year_max) && (
            <button type="button" className={GHOST_BTN} onClick={() => setFilters({ kinds: [], outcomes: [] })}>
              Filtreleri temizle
            </button>
          )}
        </div>
      </AiCard>

      {error && <ErrorState message={error} />}
      {result?.note && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">Örnek mod. </span>
          {result.note}
        </div>
      )}

      {result && result.results.length === 0 && !busy && (
        <AiCard>
          <p className="text-sm text-navy-600">Bu ölçütlerle emsal bulunamadı. Özeti genişletin ya da filtreleri gevşetin.</p>
        </AiCard>
      )}

      {result && result.results.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Emsal kararlar" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">{result.results.length} emsal bulundu</h2>
              <button type="button" onClick={runExplain} disabled={explaining} className={GHOST_BTN}>
                {explaining ? "Hazırlanıyor…" : "Neden benzer?"}
              </button>
            </div>
            <ModeBanner mode={explainMode?.mode} note={explainMode?.note} />
            {result.results.map((it) => (
              <PrecedentCard key={it.doc_id} item={it} explanation={explain[it.doc_id]} onOpen={() => setOpen(it.doc_id)} />
            ))}
          </section>
          <aside className="space-y-3">
            <StatsPanel result={result} />
          </aside>
        </div>
      )}

      {open && <DetailDialog docId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-navy-600">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${active ? "bg-accent-600 text-white ring-accent-600" : "bg-white text-navy-600 ring-surface-border hover:text-accent-800 hover:ring-accent-300"}`}
    >
      {children}
    </button>
  );
}

function PrecedentCard({ item, explanation, onOpen }: { item: PrecedentItem; explanation?: PrecedentExplanation; onOpen: () => void }) {
  const pct = Math.round((item.score ?? 0) * 100);
  return (
    <article className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy-900">{item.court}</h3>
          <p className="mt-0.5 text-xs text-navy-500">
            {item.esas_no} E. · {item.karar_no} K. · {item.tarih} · {item.kind_label}
          </p>
        </div>
        <OutcomeBadge item={item} />
      </div>

      <div className="mt-3 flex items-center gap-3" aria-label={`Benzerlik yüzde ${pct}`}>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-navy-50">
          <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
        <span className="text-[11px] text-navy-500">
          benzerlik %{pct}
          {item.via.length > 0 && <span className="text-navy-400"> · {item.via.join(" + ")}</span>}
        </span>
      </div>

      <p className="mt-3 line-clamp-4 text-sm leading-6 text-navy-700">{item.snippet}</p>

      {explanation && (
        <div className="mt-3 rounded-xl bg-accent-50/60 p-3 text-sm leading-6 text-navy-800 ring-1 ring-accent-100">
          <p>
            <span className="font-semibold">Neden benzer: </span>
            {explanation.why}
          </p>
          {explanation.takeaway && (
            <p className="mt-1">
              <span className="font-semibold">Çıkarım: </span>
              {explanation.takeaway}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.matched.map((m) => (
          <span key={m} className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] text-navy-600">
            {m}
          </span>
        ))}
        {item.laws.slice(0, 4).map((l) => (
          <span key={l} className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 ring-1 ring-accent-100">
            {l}
          </span>
        ))}
        <button type="button" onClick={onOpen} className="ml-auto text-xs font-semibold text-accent-700 hover:text-accent-900">
          Karar özetini aç →
        </button>
      </div>
    </article>
  );
}

function StatsPanel({ result }: { result: PrecedentSearchResult }) {
  const groups = useMemo(() => Object.entries(result.stats.by_kind), [result]);
  return (
    <AiCard>
      <h2 className="text-sm font-semibold text-navy-900">Bulunan emsallerin sonuçları</h2>
      <div className="mt-3 space-y-4">
        {groups.map(([kind, g]) => (
          <div key={kind}>
            <p className="mb-1.5 text-xs font-medium text-navy-600">
              {g.label} · {g.total} karar
            </p>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-navy-50" role="img" aria-label={`${g.label} sonuç dağılımı`}>
              {g.outcomes.map((o) => (
                <div key={o.key} className={BAR_TONE[o.key] ?? "bg-navy-200"} style={{ width: `${(o.n / g.total) * 100}%` }} title={`${o.label}: ${o.n}`} />
              ))}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-xs text-navy-600">
              {g.outcomes.map((o) => (
                <li key={o.key} className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${BAR_TONE[o.key] ?? "bg-navy-200"}`} />
                  {o.label} <span className="text-navy-400">× {o.n}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-surface-border pt-3 text-[11px] leading-5 text-navy-500">{result.stats.note}</p>
      {result.terms.length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-navy-400">Aramada ayırt edici sözcükler: {result.terms.slice(0, 8).join(", ")}</p>
      )}
    </AiCard>
  );
}

function DetailDialog({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [item, setItem] = useState<PrecedentItem | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getPrecedent(docId).then(setItem).catch((e) => setErr(e instanceof Error ? e.message : "Karar alınamadı."));
  }, [docId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Karar özeti"
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-navy-900">{item?.court ?? "Karar"}</h2>
            {item && (
              <p className="mt-0.5 text-xs text-navy-500">
                {item.esas_no} E. · {item.karar_no} K. · {item.tarih} · {item.kind_label}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className={GHOST_BTN} aria-label="Kapat">
            Kapat
          </button>
        </div>
        {err && <p className="mt-4 text-sm text-red-700">{err}</p>}
        {!item && !err && <p className="mt-4 text-sm text-navy-500">Yükleniyor…</p>}
        {item && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge item={item} />
              {item.laws.map((l) => (
                <span key={l} className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 ring-1 ring-accent-100">
                  {l}
                </span>
              ))}
            </div>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">Dava anlatımı</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-navy-800">{item.narr ?? item.snippet}</p>
            </section>
            {item.tail && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">Karar sonu (hüküm)</h3>
                <p className="mt-1 text-sm leading-6 text-navy-800">{item.tail}</p>
              </section>
            )}
            <p className="text-[11px] text-navy-500">Kaynak: kamuya açık mahkeme kararı. Atıf ve sonuç alanları otomatik çıkarılmıştır; kesin için resmî kaynaktan doğrulayın.</p>
          </div>
        )}
      </div>
    </div>
  );
}
