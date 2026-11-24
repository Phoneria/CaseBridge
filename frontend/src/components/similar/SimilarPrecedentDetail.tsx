"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { outcomeColor } from "@/lib/chartTheme";
import { CASE_EVENT_TYPE_LABELS, CASE_OUTCOME_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import type { AIExplanation, SimilarityFacts, SimilarPrecedentDetail as Detail } from "@/types";

import {
  CLIENT_ROLE_LABELS, Chips, Passages, SectionTitle, formatMonths, formatValue, precedentHref,
} from "./similarPrecedentUi";

export type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; value: AIExplanation | null }
  | { status: "error" };

const SECTION = "space-y-2 rounded-xl border border-surface-border p-4";

function ScoreBreakdown({ item, excluded }: { item: Detail; excluded: string[] }) {
  return (
    <section aria-labelledby="puan-dagilimi" className={SECTION}>
      <div className="flex items-baseline justify-between">
        <h3 id="puan-dagilimi" className="text-sm font-semibold text-navy-800">Puan dağılımı</h3>
        <span className="text-xs text-navy-500">Toplam {item.score} / 100</span>
      </div>
      <ul aria-label="Puan dağılımı" className="space-y-2">
        {item.score_breakdown.map((part) => {
          const ratio = part.max_points > 0 ? Math.min(part.points / part.max_points, 1) : 0;
          return (
            <li key={part.key} className="text-xs text-navy-700">
              <div className="flex justify-between">
                <span>{part.label}</span>
                <span className="tabular-nums">{Math.round(part.points)} / {Math.round(part.max_points)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-muted" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-accent-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {excluded.length > 0 && (
        <p className="text-[11px] text-navy-500">
          Hesaba katılmadı (bu davada kayıtlı değil): {excluded.join(", ")}.
        </p>
      )}
    </section>
  );
}

function KeyDifferences({ item }: { item: Detail }) {
  return (
    <section aria-labelledby="temel-farklar" className={SECTION}>
      <h3 id="temel-farklar" className="text-sm font-semibold text-navy-800">Temel farklar</h3>
      {item.key_differences.length === 0 ? (
        <p className="text-xs text-navy-500">Kayıtlı bilgilerde temel bir fark bulunmadı.</p>
      ) : (
        <ul aria-label="Temel farklar" className="divide-y divide-surface-border text-xs">
          {item.key_differences.map((d) => (
            <li key={d.label} className="grid grid-cols-[7rem_1fr_1fr] gap-2 py-1.5">
              <span className="font-medium text-navy-600">{d.label}</span>
              <span className="text-navy-800"><span className="sr-only">Bu dava: </span>{d.case_value}</span>
              <span className="text-navy-800"><span className="sr-only">Emsal: </span>{d.precedent_value}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-navy-500">Sütunlar: bu dava · emsal. Kurallar yalnızca iki dosyada da kayıtlı bilgiyi karşılaştırır.</p>
    </section>
  );
}

/** "İzlenen yol": the precedent's stored events, styled like the Gelişmeler timeline (CaseTimelinePanel). */
function Timeline({ item }: { item: Detail }) {
  return (
    <section aria-labelledby="izlenen-yol" className={SECTION}>
      <h3 id="izlenen-yol" className="text-sm font-semibold text-navy-800">İzlenen yol</h3>
      {item.timeline.length === 0 ? (
        <p className="text-xs text-navy-500">Bu emsal için kayıtlı gelişme yok.</p>
      ) : (
        <ol aria-label="İzlenen yol" className="space-y-4 border-l border-surface-border pl-4">
          {item.timeline.map((entry, index) => (
            <li key={index} className="relative flex gap-4">
              <span aria-hidden="true" className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent-500" />
              <div className="w-24 shrink-0 text-xs text-navy-500">{formatDate(entry.event_date)}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-navy-800">{entry.title}</p>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-navy-600">
                    {CASE_EVENT_TYPE_LABELS[entry.event_type] ?? entry.event_type}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AiExplanation({ state, onExplain }: { state: ExplainState; onExplain: () => void }) {
  return (
    <section aria-labelledby="yz-aciklama" className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="yz-aciklama" className="text-sm font-semibold text-navy-800">Yapay zekâ açıklaması</h3>
        <button
          type="button"
          onClick={onExplain}
          disabled={state.status === "loading"}
          aria-busy={state.status === "loading"}
          className="rounded-lg border border-accent-200 px-3 py-1.5 text-xs font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60"
        >
          {state.status === "loading" ? "Hazırlanıyor…" : state.status === "idle" ? "Yapay zekâ açıklaması" : "Yeniden oluştur"}
        </button>
      </div>
      {state.status === "idle" && (
        <p className="text-xs text-navy-500">İsteğe bağlıdır; yalnızca bu dava ile emsalin kayıtlı metinleri kullanılır.</p>
      )}
      {state.status === "loading" && <p role="status" className="text-xs text-navy-500">Açıklama hazırlanıyor…</p>}
      {state.status === "error" && (
        <p role="alert" className="text-xs text-red-700">Açıklama alınamadı. Bağlantınızı kontrol edip tekrar deneyin.</p>
      )}
      {state.status === "done" && state.value && (
        <div className="space-y-1">
          {state.value.notice && <p role="note" className="text-[11px] text-navy-500">{state.value.notice}</p>}
          <p className="text-sm leading-relaxed text-navy-800">{state.value.text}</p>
          <p className="text-[11px] text-navy-500">
            {state.value.status === "ai"
              ? "Yapay zekâ tarafından iki kayıtlı metinden üretildi; doğrulama gerektirir."
              : "Kayıtlı verilerden hazırlanan özet."}
          </p>
        </div>
      )}
    </section>
  );
}

type Row = { label: string; caseValue: string; precedentValue: string; different: boolean };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Rows of the comparison. Only facts that can meaningfully match are marked "Farklı", and only when both
 * files store them: dates, duration, outcome and the exact court name are shown for reference but never
 * marked, because they differ between any two files. The rules mirror the server's key differences.
 */
function factRows(source: SimilarityFacts, precedent: SimilarityFacts): Row[] {
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");
  const role = (v: string | null) => (v ? CLIENT_ROLE_LABELS[v] ?? v : null);
  const list = (v: string[]) => (v.length ? v.join(", ") : null);
  const both = <T,>(f: (x: SimilarityFacts) => T | null) => f(source) !== null && f(precedent) !== null;
  const row = (
    label: string, f: (x: SimilarityFacts) => string | null, differs: (() => boolean) | null = null,
  ): Row => ({ label, caseValue: dash(f(source)), precedentValue: dash(f(precedent)), different: differs ? differs() : false });
  const valueGap = () => {
    const a = source.case_value, b = precedent.case_value;
    return a !== null && b !== null && a > 0 && b > 0 && Math.min(a, b) / Math.max(a, b) < 0.5;
  };
  return [
    row("Kategori", (x) => CASE_TYPE_LABELS[x.case_type] ?? x.case_type, () => source.case_type !== precedent.case_type),
    row("Mahkeme", (x) => x.court),
    row("Mahkeme türü", (x) => x.court_type, () => both((x) => x.court_type) && source.court_type !== precedent.court_type),
    row("Müvekkil rolü", (x) => role(x.client_role), () => both((x) => x.client_role) && source.client_role !== precedent.client_role),
    row("Dava değeri", (x) => formatValue(x.case_value), valueGap),
    row("Açılış tarihi", (x) => (x.opening_date ? formatDate(x.opening_date) : null)),
    row("Karar tarihi", (x) => (x.decision_date ? formatDate(x.decision_date) : null)),
    row("Süre", (x) => formatMonths(x.duration_months)),
    row("Sonuç", (x) => CASE_OUTCOME_LABELS[x.outcome] ?? x.outcome),
    row("Delil türleri", (x) => list(x.evidence), () => !sameSet(source.evidence, precedent.evidence)),
    row("Bilirkişi raporu", (x) => (x.has_expert_report ? "Var" : "Yok"), () => source.has_expert_report !== precedent.has_expert_report),
    row("Yüklenen belge", (x) => (x.document_count ? `${x.document_count} belge` : "Belge yok"),
      () => Boolean(source.document_count) !== Boolean(precedent.document_count)),
    row("Mevzuat ve karar atıfları", (x) => list(x.statutes),
      () => source.statutes.length > 0 && precedent.statutes.length > 0 && !sameSet(source.statutes, precedent.statutes)),
  ];
}

/** Side by side: this case vs the precedent. Rows whose stored values differ are marked. */
function Compare({ source, item }: { source: SimilarityFacts; item: Detail }) {
  const rows = factRows(source, item.facts);
  return (
    <section aria-labelledby="karsilastirma" className="space-y-2">
      <h3 id="karsilastirma" className="text-sm font-semibold text-navy-800">Karşılaştırma</h3>
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="bg-surface-muted text-navy-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Bilgi</th>
              <th scope="col" className="px-3 py-2 font-semibold">Bu dava</th>
              <th scope="col" className="px-3 py-2 font-semibold">Emsal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((row) => {
              const different = row.different;
              return (
                <tr key={row.label} data-different={different || undefined} className={different ? "bg-accent-50/60" : undefined}>
                  <th scope="row" className="px-3 py-2 align-top font-medium text-navy-600">
                    {row.label}
                    {different && (
                      <span className="ml-1.5 rounded-full border border-accent-200 px-1.5 py-px text-[10px] font-semibold text-accent-700">Farklı</span>
                    )}
                  </th>
                  <td className="px-3 py-2 align-top text-navy-800">{row.caseValue}</td>
                  <td className="px-3 py-2 align-top text-navy-800">{row.precedentValue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-navy-500">Yalnızca kayıtlı bilgiler gösterilir; “—” kayıt olmadığını belirtir. “Farklı”, karşılaştırılabilir bir bilgi iki dosyada da kayıtlı ve birbirinden farklı olduğunda gösterilir; tarih, süre ve sonuç yalnızca bilgi içindir.</p>
    </section>
  );
}

export function SimilarPrecedentDetail({
  item, source, excluded, mode, onMode, onBack, explain, onExplain, canLink, busy, onToggleLink,
}: {
  item: Detail;
  source: SimilarityFacts;
  excluded: string[];
  mode: "detail" | "compare";
  onMode: (mode: "detail" | "compare") => void;
  onBack: () => void;
  explain: ExplainState;
  onExplain: () => void;
  canLink: boolean;
  busy: boolean;
  onToggleLink: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [item.precedent_id]);
  const why = item.explanation;
  const months = formatMonths(item.duration_months);
  const value = formatValue(item.case_value);
  const tab = (key: "detail" | "compare", label: string) => (
    <button
      type="button"
      aria-pressed={mode === key}
      onClick={() => onMode(key)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === key ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-surface-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-accent-700 hover:underline">
        ← Tüm benzer emsaller
      </button>
      <div className="flex items-start gap-3">
        <span
          aria-label={`Benzerlik ${item.score} / 100`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-sm font-semibold text-accent-800 ring-1 ring-accent-100"
        >
          {item.score}
        </span>
        <div className="min-w-0 space-y-1">
          <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-navy-900 outline-none">{item.case_name}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-600">
            <span>{item.case_number}</span>
            {item.court && <span>{item.court}</span>}
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcomeColor(item.outcome, "kapali") }} />
              {CASE_OUTCOME_LABELS[item.outcome] ?? item.outcome}
            </span>
            {item.decision_date && <span>Karar: {formatDate(item.decision_date)}</span>}
            {months && <span>Süre: {months}</span>}
            {value && <span>Değer: {value}</span>}
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-surface-border p-1" role="group" aria-label="Görünüm">
        {tab("detail", "Ayrıntı")}
        {tab("compare", "Karşılaştır")}
      </div>

      {mode === "compare" ? (
        <Compare source={source} item={item} />
      ) : (
        <>
          <ScoreBreakdown item={item} excluded={excluded} />
          <section aria-labelledby="neden-benzer" className={SECTION}>
            <h3 id="neden-benzer" className="text-sm font-semibold text-navy-800">Neden benzer?</h3>
            <Chips label="Eşleşen bilgiler" items={why.matching_fields} />
            <Chips label="Ortak mevzuat ve karar atıfları" items={why.shared_statutes} />
            <Chips label="Ortak anahtar terimler" items={why.shared_terms} />
            <Passages passages={why.passages} />
          </section>
          <KeyDifferences item={item} />
          <Timeline item={item} />
          <AiExplanation state={explain} onExplain={onExplain} />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={precedentHref(item.precedent_id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-surface-muted">
          Emsali aç
        </Link>
        {canLink && (
          <button
            type="button"
            disabled={busy}
            onClick={onToggleLink}
            className="rounded-lg border border-accent-200 px-3 py-1.5 text-xs font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60"
          >
            {item.linked_to_case ? "Bağlantıyı kaldır" : "Bu davaya bağla"}
          </button>
        )}
      </div>
    </div>
  );
}
