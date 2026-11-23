"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ClientFormModal } from "@/components/ClientFormModal";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { listClients } from "@/lib/api";
import { CLIENT_TYPE_LABELS } from "@/lib/clients";
import { userMessage } from "@/lib/userMessages";
import type { ClientListItem } from "@/types";

export const CLIENT_PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;
const PAGER = "rounded-xl border border-surface-border px-3 py-1.5 text-sm text-navy-700 hover:bg-surface-muted aria-disabled:opacity-40";

export function ClientListView() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    // Only a changed search resets the page (the first render must not undo a quick "Sonraki").
    const next = input.trim();
    if (next === q) return;
    const timer = setTimeout(() => {
      setQ(next);
      setOffset(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input, q]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    listClients({ q, limit: CLIENT_PAGE_SIZE, offset })
      .then((rows) => requestId.current === id && setItems(rows))
      .catch((err) => requestId.current === id && setError(userMessage(err, "Müvekkiller yüklenemedi.")))
      .finally(() => requestId.current === id && setLoading(false));
  }, [q, offset]);

  const hasNext = items.length === CLIENT_PAGE_SIZE;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Müvekkiller</h1>
        <button type="button" onClick={() => setCreating(true)}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
          Yeni müvekkil
        </button>
      </header>

      <input type="search" aria-label="Müvekkil ara" placeholder="Ad, telefon veya e-posta" value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full max-w-md rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : items.length === 0 ? (
        q ? <EmptyState message="Aramanızla eşleşen müvekkil yok." />
          : <EmptyState message="Henüz müvekkil yok." hint="Yeni müvekkil ekleyin veya bir dava açın." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase text-navy-500">
              <tr>
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3">E-posta</th>
                <th className="px-4 py-3 text-right">Dava</th>
                <th className="px-4 py-3 text-right">Açık</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {items.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => router.push(`/muvekkiller/${item.id}`)}>
                  <td className="px-4 py-3">
                    <Link href={`/muvekkiller/${item.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-800 hover:text-accent-700">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-600">{CLIENT_TYPE_LABELS[item.client_type]}</td>
                  <td className="px-4 py-3 text-navy-600">{item.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-navy-600">{item.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-navy-800">{item.case_count}</td>
                  <td className="px-4 py-3 text-right text-navy-800">{item.open_case_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(offset > 0 || hasNext) && (
        <nav aria-label="Sayfalar" className="flex justify-end gap-2">
          <button type="button" className={PAGER} aria-disabled={offset === 0}
            onClick={() => offset > 0 && setOffset(Math.max(0, offset - CLIENT_PAGE_SIZE))}>Önceki</button>
          <button type="button" className={PAGER} aria-disabled={!hasNext}
            onClick={() => hasNext && setOffset(offset + CLIENT_PAGE_SIZE)}>Sonraki</button>
        </nav>
      )}

      {creating && (
        <ClientFormModal title="Yeni müvekkil" onClose={() => setCreating(false)}
          onSaved={(client) => router.push(`/muvekkiller/${client.id}`)} />
      )}
    </div>
  );
}
