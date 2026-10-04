"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getPrecedentDocuments, getPrecedents } from "@/lib/api";
import { CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { DecisionText } from "@/components/DecisionText";
import type { Case, DocumentItem } from "@/types";

export function PrecedentsView() {
  const selectedParam = useSearchParams()?.get("karar") ?? null;
  const [rows, setRows] = useState<Case[]>([]);
  const [selected, setSelected] = useState<string | null>(selectedParam);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getPrecedents().then((items) => {
      setRows(items);
      setSelected((current) => current ?? items[0]?.id ?? null);
    }).catch(() => setError("Emsal kararlar yüklenemedi.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (selectedParam) setSelected(selectedParam); }, [selectedParam]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setDocuments([]);
    setDocumentsError(null);
    setDocumentsLoading(true);
    getPrecedentDocuments(selected).then((items) => { if (!cancelled) setDocuments(items); })
      .catch(() => { if (!cancelled) setDocumentsError("Karar metni yüklenemedi."); })
      .finally(() => { if (!cancelled) setDocumentsLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  if (loading) return <LoadingState label="Emsal kararlar yükleniyor..." />;
  if (error && rows.length === 0) return <ErrorState message={error} />;
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const visible = rows.filter((row) => [row.case_name, row.case_number, row.description ?? "", row.court ?? ""]
    .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle)));
  const current = rows.find((row) => row.id === selected);

  return <div className="space-y-5">
    <div>
      <h1 className="text-xl font-semibold text-navy-900">Emsal Kararlar</h1>
      <p className="text-sm text-navy-500">Kamuya açık anonim kararlar burada araştırma amaçlı tutulur; büro davalarına, avukat iş yüküne ve kazanma oranına dahil değildir.</p>
    </div>
    {error && <ErrorState message={error} />}
    <input type="search" aria-label="Emsal karar ara" placeholder="Karar veya konu ara..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-md rounded-xl border border-surface-border bg-white px-4 py-2 text-sm" />
    {visible.length === 0 ? <EmptyState message={rows.length === 0 ? "Henüz emsal karar yok." : "Aramayla eşleşen karar yok."} /> : (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(250px,380px)_minmax(0,1fr)]">
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
          {visible.map((row) => <li key={row.id}>
            <button type="button" onClick={() => setSelected(row.id)} className={`w-full rounded-xl border p-4 text-left ${selected === row.id ? "border-accent-400 bg-accent-50" : "border-surface-border bg-white hover:border-accent-300"}`}>
              <span className="block text-sm font-semibold text-navy-900">{row.case_name}</span>
              <span className="mt-1 block text-xs text-navy-500">{row.case_number} · {CASE_TYPE_LABELS[row.case_type] ?? row.case_type}</span>
            </button>
          </li>)}
        </ul>
        <section className="min-w-0 rounded-2xl border border-surface-border bg-white p-5 shadow-card sm:p-7">
          {!current ? <p className="text-sm text-navy-500">İncelemek için soldan bir karar seçin.</p> : <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700">Emsal karar</p>
                <h2 className="mt-1 text-xl font-semibold text-navy-900">{current.case_name}</h2>
              </div>
              <span className="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700">{CASE_TYPE_LABELS[current.case_type] ?? current.case_type}</span>
            </div>
            <dl className="mt-5 grid gap-3 rounded-xl border border-surface-border bg-surface-muted p-4 sm:grid-cols-3">
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Esas / karar no</dt><dd className="mt-1 break-words text-sm font-medium text-navy-800">{current.case_number}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Mahkeme / daire</dt><dd className="mt-1 text-sm font-medium text-navy-800">{current.court ?? "Belirtilmemiş"}</dd></div>
              <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Tarih</dt><dd className="mt-1 text-sm font-medium text-navy-800">{formatDate(current.opening_date)}</dd></div>
            </dl>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-navy-900">Kararın özeti</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-navy-700">{current.description || "Özet girilmemiş."}</p>
            </div>
            <div className="mt-7 border-t border-surface-border pt-6">
              <h3 className="text-base font-semibold text-navy-900">Karar metni</h3>
              <p className="mt-1 text-xs text-navy-500">Arşivde kayıtlı metin aşağıda doğrudan gösterilir.</p>
              {documentsLoading ? <p className="mt-4 text-sm text-navy-500">Karar metni yükleniyor…</p> : documentsError ? <ErrorState message={documentsError} /> : documents.length === 0 ? <p className="mt-4 text-sm text-navy-500">Bu karar için kayıtlı metin bulunmuyor.</p> : documents.map((document, index) => (
                <article key={document.id} className="mt-4 rounded-xl border border-surface-border bg-surface-muted/40 p-5 sm:p-8">
                  {documents.length > 1 && <h4 className="mb-4 text-sm font-semibold text-navy-800">Metin {index + 1}</h4>}
                  <DecisionText text={document.extracted_text ?? ""} />
                </article>
              ))}
            </div>
          </>}
        </section>
      </div>
    )}
  </div>;
}
