"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { downloadDocument, getPrecedentDocuments, getPrecedents } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import type { Case, DocumentItem } from "@/types";

export function PrecedentsView() {
  const selectedParam = useSearchParams()?.get("karar") ?? null;
  const [rows, setRows] = useState<Case[]>([]);
  const [selected, setSelected] = useState<string | null>(selectedParam);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getPrecedents().then(setRows).catch(() => setError("Emsal kararlar yüklenemedi.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (selectedParam) setSelected(selectedParam); }, [selectedParam]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setDocuments([]);
    getPrecedentDocuments(selected).then((items) => { if (!cancelled) setDocuments(items); })
      .catch(() => { if (!cancelled) setError("Karar belgeleri yüklenemedi."); });
    return () => { cancelled = true; };
  }, [selected]);

  async function download(document: DocumentItem) {
    try { saveBlob(await downloadDocument(document.id), document.filename); }
    catch { setError("Karar belgesi indirilemedi."); }
  }

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
      <div className="grid gap-4 lg:grid-cols-[minmax(250px,380px)_1fr]">
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
          {visible.map((row) => <li key={row.id}>
            <button type="button" onClick={() => setSelected(row.id)} className={`w-full rounded-xl border p-4 text-left ${selected === row.id ? "border-accent-400 bg-accent-50" : "border-surface-border bg-white hover:border-accent-300"}`}>
              <span className="block text-sm font-semibold text-navy-900">{row.case_name}</span>
              <span className="mt-1 block text-xs text-navy-500">{row.case_number} · {CASE_TYPE_LABELS[row.case_type] ?? row.case_type}</span>
            </button>
          </li>)}
        </ul>
        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          {!current ? <p className="text-sm text-navy-500">İncelemek için soldan bir karar seçin.</p> : <>
            <h2 className="text-lg font-semibold text-navy-900">{current.case_name}</h2>
            <p className="mt-1 text-xs text-navy-500">{current.case_number} · {current.court ?? "Mahkeme belirtilmemiş"} · {formatDate(current.opening_date)}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-navy-700">{current.description || "Özet girilmemiş."}</p>
            <h3 className="mt-6 text-sm font-semibold text-navy-800">Karar belgeleri</h3>
            {documents.length === 0 ? <p className="mt-2 text-xs text-navy-500">Belge bulunamadı veya yükleniyor.</p> : documents.map((document) => <div key={document.id} className="mt-3 rounded-xl border border-surface-border p-3">
              <button type="button" onClick={() => download(document)} className="text-sm font-medium text-accent-700 hover:underline">{document.filename} indir</button>
              {document.extracted_text && <details className="mt-2 text-xs text-navy-700"><summary className="cursor-pointer">Tam metni göster</summary><p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap">{document.extracted_text}</p></details>}
            </div>)}
          </>}
        </section>
      </div>
    )}
  </div>;
}
