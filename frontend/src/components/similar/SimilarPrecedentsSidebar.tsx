"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/EmptyState";
import { explainSimilarPrecedent, getSimilarPrecedents, setPrecedentLink } from "@/lib/api";
import { outcomeColor } from "@/lib/chartTheme";
import { CASE_OUTCOME_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { CaseOutcome, SimilarPrecedentDetail as Detail, SimilarPrecedentsResponse } from "@/types";

import { SimilarPrecedentDetail, type ExplainState } from "./SimilarPrecedentDetail";
import {
  Chips, OUTCOME_ORDER, Passages, formatMonths, formatValue, precedentHref, summaryLine,
} from "./similarPrecedentUi";

export { highlightRuns, precedentHref } from "./similarPrecedentUi";

const LIMIT = 20;
const SLIDER_DELAY_MS = 250;

export type SortKey = "score" | "decision" | "duration" | "value";
const SORT_LABELS: Record<SortKey, string> = {
  score: "Benzerlik",
  decision: "Karar tarihi (yeni → eski)",
  duration: "Süre (kısa → uzun)",
  value: "Dava değeri (yüksek → düşük)",
};

/** Client-side order; missing values go last and ties keep the server's similarity order. */
export function sortItems(items: Detail[], key: SortKey): Detail[] {
  if (key === "score") return items;
  const value = (item: Detail): number | null => {
    if (key === "decision") return item.decision_date ? -Date.parse(item.decision_date) : null;
    if (key === "duration") return item.duration_months;
    return item.case_value === null ? null : -item.case_value;
  };
  return items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.index - b.index : a.v === null ? 1 : -1;
      return a.v - b.v || a.index - b.index;
    })
    .map((row) => row.item);
}

function PrecedentCard({
  item, canLink, busy, onToggleLink, onOpen,
}: {
  item: Detail;
  canLink: boolean;
  busy: boolean;
  onToggleLink: (item: Detail) => void;
  onOpen: (item: Detail) => void;
}) {
  const [open, setOpen] = useState(false);
  const why = item.explanation;
  const detailsId = `benzer-emsal-${item.precedent_id}`;
  const hasDetails = why.passages.length > 0 || why.shared_terms.length > 0;
  const months = formatMonths(item.duration_months);
  const value = formatValue(item.case_value);
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          aria-label={`Benzerlik ${item.score} / 100`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-sm font-semibold text-accent-800 ring-1 ring-accent-100"
        >
          {item.score}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="block text-left text-sm font-semibold text-navy-900 hover:text-accent-700 hover:underline"
          >
            {item.case_name}
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-600">
            <span>{item.case_number}</span>
            <span>{CASE_TYPE_LABELS[item.case_type] ?? item.case_type}</span>
            {item.court && <span>{item.court}</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-2 py-0.5 font-medium text-navy-700">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcomeColor(item.outcome, "kapali") }} />
              {CASE_OUTCOME_LABELS[item.outcome] ?? item.outcome}
            </span>
            {item.decision_date && <span>Karar: {formatDate(item.decision_date)}</span>}
            {months && <span>Süre: {months}</span>}
            {value && <span>Değer: {value}</span>}
            {item.linked_to_case && (
              <span className="rounded-full border border-accent-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">Bağlı</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Chips label="Eşleşen bilgiler" items={why.matching_fields} />
        <Chips label="Ortak mevzuat ve karar atıfları" items={why.shared_statutes} />
      </div>

      {hasDetails && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
            className="text-xs font-semibold text-accent-700 hover:underline"
          >
            {open ? "Neden benzer? (gizle)" : "Neden benzer?"}
          </button>
          {open && (
            <div id={detailsId} className="mt-2 space-y-3">
              <Chips label="Ortak anahtar terimler" items={why.shared_terms} />
              <Passages passages={why.passages} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`${item.case_name}: ayrıntılar ve karşılaştırma`}
          className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
        >
          Ayrıntılar
        </button>
        <Link href={precedentHref(item.precedent_id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-surface-muted">
          Emsali aç
        </Link>
        {canLink && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleLink(item)}
            className="rounded-lg border border-accent-200 px-3 py-1.5 text-xs font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60"
          >
            {item.linked_to_case ? "Bağlantıyı kaldır" : "Bu davaya bağla"}
          </button>
        )}
      </div>
    </li>
  );
}

const FIELD = "rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-navy-800 outline-none focus:border-accent-400";

function Filters({
  courts, outcomes, onOutcomes, court, onCourt, minScore, onMinScore, sort, onSort, onReset,
}: {
  courts: string[];
  outcomes: CaseOutcome[];
  onOutcomes: (value: CaseOutcome[]) => void;
  court: string;
  onCourt: (value: string) => void;
  minScore: number;
  onMinScore: (value: number) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  onReset: () => void;
}) {
  const active = outcomes.length > 0 || court !== "" || minScore > 0;
  return (
    <div role="group" aria-label="Filtreler" className="space-y-3 rounded-xl border border-surface-border p-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sonuç">
        {OUTCOME_ORDER.map((outcome) => {
          const on = outcomes.includes(outcome);
          return (
            <button
              key={outcome}
              type="button"
              aria-pressed={on}
              onClick={() => onOutcomes(on ? outcomes.filter((o) => o !== outcome) : [...outcomes, outcome])}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? "border-navy-900 bg-navy-900 text-white" : "border-surface-border text-navy-700 hover:bg-surface-muted"}`}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcomeColor(outcome, "kapali") }} />
              {CASE_OUTCOME_LABELS[outcome]}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-navy-600">
          Mahkeme
          <select value={court} onChange={(e) => onCourt(e.target.value)} className={`mt-1 w-full ${FIELD}`}>
            <option value="">Tüm mahkemeler</option>
            {courts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-medium text-navy-600">
          Sırala
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className={`mt-1 w-full ${FIELD}`}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="benzer-min-puan" className="shrink-0 text-[11px] font-medium text-navy-600">
          En az benzerlik: <span className="tabular-nums text-navy-800">{minScore}</span>
        </label>
        <input
          id="benzer-min-puan"
          type="range"
          min={0}
          max={90}
          step={5}
          value={minScore}
          onChange={(e) => onMinScore(Number(e.target.value))}
          className="w-full accent-accent-600"
        />
        {active && (
          <button type="button" onClick={onReset} className="shrink-0 text-[11px] font-semibold text-accent-700 hover:underline">
            Temizle
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Benzer Davalar" sidebar on the case detail: the bureau's own precedents ranked against this case,
 * with filters, a detail view (score breakdown, timeline, differences, optional AI explanation) and a
 * side-by-side comparison. Everything except the optional AI text is copied from stored data.
 */
export function SimilarPrecedentsSidebar({
  caseId, canLink, onClose,
}: {
  caseId: string;
  canLink: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SimilarPrecedentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<CaseOutcome[]>([]);
  const [court, setCourt] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [appliedMinScore, setAppliedMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>("score");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"detail" | "compare">("detail");
  const [explain, setExplain] = useState<Record<string, ExplainState>>({});
  const [linked, setLinked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => setAppliedMinScore(minScore), SLIDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [minScore]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    getSimilarPrecedents(caseId, { limit: LIMIT, outcome: outcomes, court: court || null, minScore: appliedMinScore })
      .then((body) => { if (live) setData(body); })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [caseId, outcomes, court, appliedMinScore]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, []);

  const items = useMemo(() => {
    const rows = (data?.items ?? []).map((item) =>
      item.precedent_id in linked ? { ...item, linked_to_case: linked[item.precedent_id] } : item);
    return sortItems(rows, sort);
  }, [data, linked, sort]);
  const selected = selectedId ? items.find((item) => item.precedent_id === selectedId) ?? null : null;

  async function toggleLink(item: Detail) {
    setBusyId(item.precedent_id);
    setLinkError(null);
    try {
      await setPrecedentLink(caseId, item.precedent_id, !item.linked_to_case);
      setLinked((map) => ({ ...map, [item.precedent_id]: !item.linked_to_case }));
    } catch (err) {
      setLinkError(userMessage(err, "Emsal bağlantısı güncellenemedi."));
    } finally {
      setBusyId(null);
    }
  }

  async function runExplain(precedentId: string) {
    setExplain((map) => ({ ...map, [precedentId]: { status: "loading" } }));
    try {
      const value = await explainSimilarPrecedent(caseId, precedentId);
      setExplain((map) => ({ ...map, [precedentId]: { status: "done", value } }));
    } catch {
      setExplain((map) => ({ ...map, [precedentId]: { status: "error" } }));
    }
  }

  function resetFilters() {
    setOutcomes([]);
    setCourt("");
    setMinScore(0);
    setAppliedMinScore(0);
  }

  let body: ReactNode;
  if (selected && data) {
    body = (
      <SimilarPrecedentDetail
        item={selected}
        source={data.source}
        excluded={data.summary.excluded_signals}
        mode={mode}
        onMode={setMode}
        onBack={() => { setSelectedId(null); setMode("detail"); }}
        explain={explain[selected.precedent_id] ?? { status: "idle" }}
        onExplain={() => runExplain(selected.precedent_id)}
        canLink={canLink}
        busy={busyId === selected.precedent_id}
        onToggleLink={() => toggleLink(selected)}
      />
    );
  } else {
    let list: ReactNode;
    if (failed) {
      list = <p role="alert" className="text-sm text-navy-700">Benzer emsaller yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>;
    } else if (data === null) {
      list = <p role="status" className="text-sm text-navy-500">Benzer emsaller aranıyor…</p>;
    } else if (items.length === 0) {
      const filtered = outcomes.length > 0 || court !== "" || appliedMinScore > 0;
      list = filtered
        ? <EmptyState message="Filtrelere uyan emsal yok." hint="Filtreleri gevşetin ya da temizleyin." />
        : <EmptyState message="Benzer emsal bulunamadı." hint="Talep, olay özeti ve taraf beyanlarını doldurmak ya da belge yüklemek eşleşmeyi iyileştirir." />;
    } else {
      list = (
        <ol aria-label="Benzer emsaller" aria-busy={loading} className={`divide-y divide-surface-border ${loading ? "opacity-60" : ""}`}>
          {items.map((item) => (
            <PrecedentCard
              key={item.precedent_id}
              item={item}
              canLink={canLink}
              busy={busyId === item.precedent_id}
              onToggleLink={toggleLink}
              onOpen={(row) => { setSelectedId(row.precedent_id); setMode("detail"); }}
            />
          ))}
        </ol>
      );
    }
    body = (
      <>
        {data && (data.summary.count > 0 || outcomes.length > 0 || court !== "" || appliedMinScore > 0) && (
          <Filters
            courts={data.summary.available_courts}
            outcomes={outcomes}
            onOutcomes={setOutcomes}
            court={court}
            onCourt={setCourt}
            minScore={minScore}
            onMinScore={setMinScore}
            sort={sort}
            onSort={setSort}
            onReset={resetFilters}
          />
        )}
        {list}
      </>
    );
  }

  const wide = selected !== null && mode === "compare";
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-scrim backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="benzer-emsaller-baslik"
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-surface-border bg-white shadow-xl outline-none ${wide ? "sm:w-[720px]" : "sm:w-[520px]"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="benzer-emsaller-baslik" className="text-base font-semibold text-navy-900">Benzer Davalar</h2>
            {data && data.summary.count > 0 ? (
              <p aria-label="Özet" className="mt-0.5 text-xs font-medium text-navy-700">
                {summaryLine(data.summary)}
                {data.summary.count > data.items.length && (
                  <span className="font-normal text-navy-500"> · ilk {data.items.length} gösteriliyor</span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-navy-500">
                Büronuzun emsal arşivi; metin benzerliği, kategori, mahkeme ve ortak mevzuat atıflarına göre sıralanır.
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Benzer Davalar panelini kapat" className="rounded-lg px-2 py-1 text-sm text-navy-600 hover:bg-surface-muted">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {linkError && <p role="alert" className="text-sm text-red-700">{linkError}</p>}
          {body}
        </div>
        <p className="border-t border-surface-border px-5 py-3 text-[11px] text-navy-500">
          Açıklamalar yalnızca kayıtlı dava ve emsal bilgileri ile yüklenen belge metinlerinden alınır; yapay zekâ açıklaması yalnızca istendiğinde ve iki kayıtlı metinden üretilir. Puan bir öneridir, hukuki değerlendirmenin yerini tutmaz.
        </p>
      </div>
    </div>
  );
}
