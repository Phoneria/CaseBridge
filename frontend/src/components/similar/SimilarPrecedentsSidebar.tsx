"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/EmptyState";
import { getSimilarPrecedents, setPrecedentLink } from "@/lib/api";
import { outcomeColor } from "@/lib/chartTheme";
import { buildHref } from "@/lib/filters";
import { CASE_OUTCOME_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { PassagePair, SimilarPrecedent, TextHighlight } from "@/types";

const LIMIT = 8;

export function precedentHref(id: string): string {
  return buildHref("/emsaller", { karar: id });
}

/** Splits text into plain and highlighted runs. Offsets come from the API and index the same string. */
export function highlightRuns(text: string, highlights: TextHighlight[]): { text: string; marked: boolean }[] {
  const runs: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const { start, end } of [...highlights].sort((a, b) => a.start - b.start)) {
    if (start < at || end > text.length || end <= start) continue;
    if (start > at) runs.push({ text: text.slice(at, start), marked: false });
    runs.push({ text: text.slice(start, end), marked: true });
    at = end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), marked: false });
  return runs;
}

function Highlighted({ text, highlights }: { text: string; highlights: TextHighlight[] }) {
  return (
    <>
      {highlightRuns(text, highlights).map((run, index) =>
        run.marked ? (
          <mark key={index} className="rounded bg-accent-100 px-0.5 text-navy-900">{run.text}</mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">{label}</p>
      <ul aria-label={label} className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] text-navy-700">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Passage({ pair }: { pair: PassagePair }) {
  return (
    <li className="grid gap-2 rounded-xl border border-surface-border p-3 text-xs leading-relaxed text-navy-700">
      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">Bu dava · {pair.case_label}</p>
        <p><Highlighted text={pair.case_text} highlights={pair.case_highlights} /></p>
      </div>
      <div className="border-t border-surface-border pt-2">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-500">Emsal · {pair.precedent_label}</p>
        <p><Highlighted text={pair.precedent_text} highlights={pair.precedent_highlights} /></p>
      </div>
    </li>
  );
}

function PrecedentItem({
  item, canLink, busy, onToggleLink,
}: {
  item: SimilarPrecedent;
  canLink: boolean;
  busy: boolean;
  onToggleLink: (item: SimilarPrecedent) => void;
}) {
  const [open, setOpen] = useState(false);
  const why = item.explanation;
  const detailsId = `benzer-emsal-${item.precedent_id}`;
  const hasDetails = why.passages.length > 0 || why.shared_terms.length > 0;
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
          <Link href={precedentHref(item.precedent_id)} className="block text-sm font-semibold text-navy-900 hover:text-accent-700 hover:underline">
            {item.case_name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-600">
            <span>{item.case_number}</span>
            <span>{CASE_TYPE_LABELS[item.case_type] ?? item.case_type}</span>
            {item.court && <span>{item.court}</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-2 py-0.5 font-medium text-navy-700">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: outcomeColor(item.outcome, "kapali") }} />
              {CASE_OUTCOME_LABELS[item.outcome] ?? item.outcome}
            </span>
            {item.decision_date && <span>Karar: {formatDate(item.decision_date)}</span>}
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
              {why.passages.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">Eşleşen pasajlar</p>
                  <ol aria-label="Eşleşen pasajlar" className="mt-1 space-y-2">
                    {why.passages.map((pair, index) => <Passage key={index} pair={pair} />)}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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

/**
 * "Benzer Davalar" sidebar on the case detail: the bureau's own precedents ranked against this case,
 * with an extractive explanation (no AI text). Opens as a right-hand drawer.
 */
export function SimilarPrecedentsSidebar({
  caseId, canLink, onClose,
}: {
  caseId: string;
  canLink: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<SimilarPrecedent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    setFailed(false);
    getSimilarPrecedents(caseId, LIMIT)
      .then((rows) => { if (live) setItems(rows); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [caseId]);

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

  async function toggleLink(item: SimilarPrecedent) {
    setBusyId(item.precedent_id);
    setLinkError(null);
    try {
      await setPrecedentLink(caseId, item.precedent_id, !item.linked_to_case);
      setItems((rows) => rows?.map((row) => row.precedent_id === item.precedent_id
        ? { ...row, linked_to_case: !item.linked_to_case } : row) ?? null);
    } catch (err) {
      setLinkError(userMessage(err, "Emsal bağlantısı güncellenemedi."));
    } finally {
      setBusyId(null);
    }
  }

  let body: ReactNode;
  if (failed) {
    body = <p role="alert" className="text-sm text-navy-700">Benzer emsaller yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>;
  } else if (items === null) {
    body = <p role="status" className="text-sm text-navy-500">Benzer emsaller aranıyor…</p>;
  } else if (items.length === 0) {
    body = <EmptyState message="Benzer emsal bulunamadı." hint="Talep, olay özeti ve taraf beyanlarını doldurmak ya da belge yüklemek eşleşmeyi iyileştirir." />;
  } else {
    body = (
      <ol aria-label="Benzer emsaller" className="divide-y divide-surface-border">
        {items.map((item) => (
          <PrecedentItem key={item.precedent_id} item={item} canLink={canLink} busy={busyId === item.precedent_id} onToggleLink={toggleLink} />
        ))}
      </ol>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-scrim backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="benzer-emsaller-baslik"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col border-l border-surface-border bg-white shadow-xl outline-none sm:w-[460px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="benzer-emsaller-baslik" className="text-base font-semibold text-navy-900">Benzer Davalar</h2>
            <p className="mt-0.5 text-xs text-navy-500">
              Büronuzun emsal arşivi; metin benzerliği, kategori, mahkeme ve ortak mevzuat atıflarına göre sıralanır.
            </p>
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
          Açıklamalar yalnızca kayıtlı dava ve emsal bilgileri ile yüklenen belge metinlerinden alınır; yapay zekâ yorumu içermez. Puan bir öneridir, hukuki değerlendirmenin yerini tutmaz.
        </p>
      </div>
    </div>
  );
}
