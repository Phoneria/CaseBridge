"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { getCases } from "@/lib/api";
import {
  CASE_LIST_PARAM_KEYS,
  CASE_STATUSES,
  CASE_TYPES,
  OUTCOME_SLUG_LABELS,
  caseListHref,
  describeCaseListQuery,
  parseCaseListQuery,
  toCaseListFilters,
  type OutcomeSlug,
} from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { Case } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

const STATUS_BADGE_STYLES: Record<string, string> = {
  devam_eden: "bg-accent-50 text-accent-700",
  durusma_bekleyen: "bg-amber-50 text-amber-700",
  karar_bekleyen: "bg-blue-50 text-blue-700",
  kapali: "bg-surface-muted text-navy-500",
};

const SELECT = "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";

export function CaseListView() {
  const router = useRouter();
  const { params, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const query = useMemo(() => parseCaseListQuery(params), [params]);
  const queryKey = caseListHref(query);
  const chips = describeCaseListQuery(query);

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(query.ara ?? "");
  const latestRequestId = useRef<number>(0);

  function load() {
    setLoading(true);
    setError(null);
    const requestId = ++latestRequestId.current;
    getCases(toCaseListFilters(query))
      .then((data) => {
        if (requestId === latestRequestId.current) {
          setCases(data);
        }
      })
      .catch(() => {
        if (requestId === latestRequestId.current) {
          setError("Davalar yüklenemedi. Lütfen daha sonra tekrar deneyin.");
        }
      })
      .finally(() => {
        if (requestId === latestRequestId.current) {
          setLoading(false);
        }
      });
  }

  useEffect(() => {
    load();
    // queryKey is the serialized query; reload whenever the URL filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    setSearch(query.ara ?? "");
  }, [query.ara]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setParams({ ara: search.trim() || null });
  }

  function removeFilter(key: string) {
    if (key === "ara") setSearch("");
    setParams({ [key]: null });
  }

  function clearFilters() {
    setSearch("");
    setParams(Object.fromEntries(CASE_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  function handleRowClick(event: React.MouseEvent, caseId: string) {
    if ((event.target as HTMLElement).closest("a, button, input, select")) return;
    router.push(quickViewHref(caseId), { scroll: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Davalar</h1>
          <p className="text-sm text-navy-500">Tüm aktif ve geçmiş davalarınızı yönetin.</p>
        </div>
        <Link
          href="/davalar/yeni"
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          + Yeni Dava
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex min-w-[260px] flex-1 gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dava adı, müvekkil veya karşı taraf ara..."
            className="w-full max-w-md rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
          />
          <button type="submit" className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
            Ara
          </button>
        </form>
        <select aria-label="Kategori filtresi" value={query.kategori ?? ""} onChange={(e) => setParams({ kategori: e.target.value || null })} className={SELECT}>
          <option value="">Tüm kategoriler</option>
          {CASE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CASE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select aria-label="Durum filtresi" value={query.durum ?? ""} onChange={(e) => setParams({ durum: e.target.value || null })} className={SELECT}>
          <option value="">Tüm durumlar</option>
          <option value="aktif">Aktif (kapalı hariç)</option>
          {CASE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CASE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select aria-label="Sonuç filtresi" value={query.sonuc ?? ""} onChange={(e) => setParams({ sonuc: e.target.value || null })} className={SELECT}>
          <option value="">Tüm sonuçlar</option>
          {(Object.keys(OUTCOME_SLUG_LABELS) as OutcomeSlug[]).map((slug) => (
            <option key={slug} value={slug}>
              {OUTCOME_SLUG_LABELS[slug]}
            </option>
          ))}
        </select>
      </div>

      <FilterChips chips={chips} onRemove={removeFilter} onClear={clearFilters} resultCount={loading || error ? undefined : cases.length} />

      {loading && <LoadingState label="Davalar yükleniyor..." />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && cases.length === 0 && chips.length > 0 && <NoFilterResults onClear={clearFilters} />}
      {!loading && !error && cases.length === 0 && chips.length === 0 && (
        <EmptyState message="Henüz dava bulunmuyor." hint="Yeni bir dava oluşturarak başlayın." />
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs text-navy-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dava No</th>
                <th className="px-4 py-3 font-medium">Dava Adı</th>
                <th className="px-4 py-3 font-medium">Müvekkil</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Sonraki Duruşma</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Önizle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} onClick={(event) => handleRowClick(event, c.id)} className="cursor-pointer border-t border-surface-border hover:bg-surface-muted">
                  <td className="px-4 py-3 text-navy-500">{c.case_number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/davalar/${c.id}`} className="font-medium text-navy-900 hover:text-accent-600">
                      {c.case_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{c.client_name}</td>
                  <td className="px-4 py-3">
                    <Link href={caseListHref({ ...query, kategori: c.case_type })} className="text-navy-700 hover:text-accent-700 hover:underline">
                      {CASE_TYPE_LABELS[c.case_type] ?? c.case_type}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={caseListHref({ ...query, durum: c.status })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium hover:ring-1 hover:ring-accent-300 ${
                        STATUS_BADGE_STYLES[c.status] ?? "bg-surface-muted text-navy-600"
                      }`}
                    >
                      {CASE_STATUS_LABELS[c.status] ?? c.status}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{c.next_hearing_date ? formatDate(c.next_hearing_date) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={quickViewHref(c.id)}
                      scroll={false}
                      aria-label={`${c.case_name} önizle`}
                      className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-600 hover:border-accent-400 hover:text-accent-700"
                    >
                      Önizle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
