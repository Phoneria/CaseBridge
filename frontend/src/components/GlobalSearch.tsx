"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getCases, getPrecedents, listAllTasks } from "@/lib/api";
import { buildHref, caseDetailHref } from "@/lib/filters";
import type { Case, TaskWithCase } from "@/types";

type SearchItem = { id: string; kind: "Dava" | "Emsal" | "Görev"; title: string; detail: string; href: string; haystack: string };

function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR");
}

export function GlobalSearch() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    Promise.all([getCases({ include_archived: true }), getPrecedents(), listAllTasks()])
      .then(([cases, precedents, tasks]: [Case[], Case[], TaskWithCase[]]) => {
        if (cancelled || currentRequest !== requestId.current) return;
        setRows([
          ...cases.map((item): SearchItem => ({
            id: item.id, kind: "Dava", title: item.case_name,
            detail: `${item.case_number} · ${item.client_name}`,
            href: caseDetailHref(item.id),
            haystack: fold([item.case_name, item.case_number, item.client_name, item.opposing_party ?? "", item.description ?? ""].join(" ")),
          })),
          ...precedents.map((item): SearchItem => ({
            id: item.id, kind: "Emsal", title: item.case_name,
            detail: item.case_number,
            href: buildHref("/emsaller", { karar: item.id }),
            haystack: fold([item.case_name, item.case_number, item.description ?? "", item.court ?? ""].join(" ")),
          })),
          ...tasks.map((item): SearchItem => ({
            id: item.id, kind: "Görev", title: item.title,
            detail: `${item.case_number} · ${item.case_name}`,
            href: caseDetailHref(item.case_id, "gorevler"),
            haystack: fold([item.title, item.description ?? "", item.case_name, item.case_number].join(" ")),
          })),
        ]);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const needle = fold(query.trim());
  const matches = needle ? rows.filter((item) => item.haystack.includes(needle)) : [];

  return <div className="relative">
    <button type="button" aria-label="Genel arama" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-navy-600 hover:bg-surface-muted">
      <span aria-hidden="true">⌕</span><span className="hidden md:inline">Ara</span><span className="hidden rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-navy-400 lg:inline">⌘K</span>
    </button>
    {open && <div className="absolute right-0 z-30 mt-2 w-[min(88vw,400px)] rounded-xl border border-surface-border bg-white p-3 shadow-xl" role="dialog" aria-label="Genel arama">
      <div className="flex items-center gap-2">
        <input autoFocus type="search" aria-label="Dava, emsal veya görev ara" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Dava, emsal veya görev ara..." className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Aramayı kapat" className="rounded-lg px-2 py-2 text-sm text-navy-500 hover:bg-surface-muted">✕</button>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto">
        {loading ? <p className="p-2 text-sm text-navy-500">Arama verileri yükleniyor...</p>
          : error ? <p role="alert" className="p-2 text-sm text-red-600">Arama verileri yüklenemedi. Kapatıp yeniden açın.</p>
          : !needle ? <p className="p-2 text-sm text-navy-500">Büro davaları, emsal kararlar ve görevlerde arayın.</p>
          : matches.length === 0 ? <p className="p-2 text-sm text-navy-500">Eşleşen kayıt yok.</p>
          : <ul className="space-y-1">{matches.slice(0, 8).map((item) => <li key={`${item.kind}-${item.id}`}>
              <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-surface-muted">
                <span className="text-[11px] font-medium text-accent-700">{item.kind}</span>
                <span className="block truncate text-sm font-medium text-navy-900">{item.title}</span>
                <span className="block truncate text-xs text-navy-500">{item.detail}</span>
              </Link>
            </li>)}</ul>}
        {!loading && !error && matches.length > 8 && <p className="px-3 pt-2 text-xs text-navy-500">İlk 8 sonuç gösteriliyor; daha özgül bir arama deneyin.</p>}
      </div>
    </div>}
  </div>;
}
