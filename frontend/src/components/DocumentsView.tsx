"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { downloadDocument, listAllDocuments } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { DOCUMENT_LIST_PARAM_KEYS, describeDocumentListQuery, filterDocuments, parseDocumentListQuery } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { DocumentWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

const CONTROL = "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";

export function DocumentsView() {
  const { params, hrefWith, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const urlQuery = useMemo(() => parseDocumentListQuery(params), [params]);

  const [documents, setDocuments] = useState<DocumentWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local mirror of ?ara= so typing filters instantly; the URL is updated for persistence.
  const [search, setSearch] = useState(urlQuery.ara ?? "");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllDocuments()
      .then(setDocuments)
      .catch(() => setError("Belgeler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(doc: DocumentWithCase) {
    setDownloadingId(doc.id);
    setDownloadError(null);
    try {
      saveBlob(await downloadDocument(doc.id), doc.filename);
    } catch {
      setDownloadError("Belge indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setDownloadingId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setParams(Object.fromEntries(DOCUMENT_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  function removeFilter(key: string) {
    if (key === "ara") setSearch("");
    setParams({ [key]: null });
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const query = { ...urlQuery, ara: search.trim() || undefined };
  const visible = filterDocuments(documents, query);
  const chips = describeDocumentListQuery(query, (caseId) => documents.find((d) => d.case_id === caseId)?.case_name);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-navy-900">Belgeler</h1>
          {documents.length > 0 && (
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">{documents.length} belge</span>
          )}
        </div>
        <p className="text-sm text-navy-500">Tüm davalardaki belgelere buradan erişin. Belge yükleme dava detay sayfasından yapılır.</p>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Belge ara"
            placeholder="Dosya adı ara..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setParams({ ara: event.target.value.trim() || null });
            }}
            className={`w-full max-w-sm ${CONTROL}`}
          />
          <select aria-label="Tür filtresi" value={urlQuery.tur ?? ""} onChange={(e) => setParams({ tur: e.target.value || null })} className={CONTROL}>
            <option value="">Tüm türler</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="txt">TXT</option>
          </select>
        </div>
      )}

      <FilterChips chips={chips} onRemove={removeFilter} onClear={clearFilters} resultCount={visible.length} />
      {downloadError && <ErrorState message={downloadError} />}

      {documents.length === 0 ? (
        <EmptyState message="Henüz belge yok." hint="Belgeler bir davanın Belgeler sekmesinden yüklenir." />
      ) : visible.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {visible.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-4 p-4 transition hover:bg-surface-muted">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-[10px] font-bold uppercase text-accent-700">
                    {doc.file_type}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={quickViewHref(doc.case_id, { type: "belge", id: doc.id })}
                      scroll={false}
                      className="font-medium text-navy-800 hover:text-accent-700"
                    >
                      {doc.filename}
                    </Link>
                    <p className="text-xs text-navy-500">
                      <Link href={hrefWith({ dava: doc.case_id })} replace scroll={false} className="hover:text-accent-700 hover:underline">
                        {doc.case_number} - {doc.case_name}
                      </Link>
                    </p>
                    {doc.extracted_text && <p className="mt-1 max-w-2xl truncate text-xs text-navy-400">{doc.extracted_text}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-navy-400">{formatDate(doc.uploaded_at)}</span>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    aria-label={`${doc.filename} indir`}
                    className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-accent-400 hover:text-accent-700 disabled:opacity-60"
                  >
                    {downloadingId === doc.id ? "İndiriliyor..." : "İndir"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
