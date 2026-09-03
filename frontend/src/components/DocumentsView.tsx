"use client";

import { useEffect, useState } from "react";

import { listAllDocuments } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import type { DocumentWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllDocuments()
      .then(setDocuments)
      .catch(() => setError("Belgeler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-navy-900">Belgeler</h1>
          {documents.length > 0 && (
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
              {documents.length} belge
            </span>
          )}
        </div>
        <p className="text-sm text-navy-500">
          Tüm davalardaki belgelere buradan erişin. Belge yükleme dava detay sayfasından yapılır.
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState message="Henüz belge yok." hint="Belgeler bir davanın Belgeler sekmesinden yüklenir." />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-[10px] font-bold uppercase text-accent-700">
                    {doc.file_type}
                  </span>
                  <div className="min-w-0">
                  <p className="font-medium text-navy-800">{doc.filename}</p>
                  <p className="text-xs text-navy-500">
                    {doc.case_number} - {doc.case_name}
                  </p>
                    {doc.extracted_text && (
                      <p className="mt-1 max-w-2xl truncate text-xs text-navy-400">{doc.extracted_text}</p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-navy-400">{formatDate(doc.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
