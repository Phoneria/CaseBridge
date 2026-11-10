"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { getAiConnectivity } from "@/lib/api";
import { connectivityMessage } from "@/lib/aiConnectivity";
import type { AIConnectivity } from "@/types";

const POLL_MS = 60_000;

type State = "checking" | "online" | "offline";

export function AiStatusIndicator({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [data, setData] = useState<AIConnectivity | null>(null);
  const [state, setState] = useState<State>("checking");
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) { setOpen(false); setPinned(false); }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const check = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    if (force) setState("checking");
    try {
      const result = await getAiConnectivity(force);
      setData(result);
      setState(result.connected ? "online" : "offline");
    } catch {
      setData(null);
      setState("offline");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(() => check(), POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  const label = state === "online" ? "AI bağlı" : state === "offline" ? "AI bağlantısı yok" : "AI kontrol ediliyor";
  const dot = state === "online" ? "bg-emerald-500" : state === "offline" ? "bg-red-500" : "bg-navy-300";
  const ring = state === "online" ? "bg-emerald-400" : "bg-red-400";
  const summary = state === "online" ? "Hizmetler hazır" : state === "offline" ? "Hizmetler kontrol edilmeli" : "Durum sorgulanıyor";

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOpen(false); setPinned(false); }
      }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); wrapperRef.current?.querySelector("button")?.focus(); setOpen(false); setPinned(false); } }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => { setPinned(!pinned); setOpen(!pinned); }}
        aria-label={`${label}. Ayrıntılar`}
        data-state={state}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
          tone === "dark" ? "border-white/15 bg-white/[0.04] hover:bg-white/[0.09]" : "border-surface-border hover:bg-surface-muted"
        }`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {state !== "checking" && (
            <span aria-hidden="true" className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${ring}`} />
          )}
          <span aria-hidden="true" className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={`block text-xs font-semibold ${tone === "dark" ? "text-white" : "text-navy-900"}`}>{label}</span>
          <span className={`block truncate text-[11px] ${tone === "dark" ? "text-[#AEBBD2]" : "text-navy-500"}`}>{summary}</span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 w-full pb-2">
        <div
          id={dialogId}
          role="dialog"
          aria-label="AI bağlantı ayrıntıları"
          className="rounded-xl border border-surface-border bg-white p-3 shadow-lg"
        >
          {data ? (
            <ul className="flex flex-col gap-2">
              {data.checks.map((c) => (
                <li key={c.name} className="flex gap-2 text-xs">
                  <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.reachable ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy-900">
                      {c.name}
                    </span>
                    {!c.reachable && <span className="mt-1 block leading-5 text-navy-600">{connectivityMessage(c)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600">Hizmet durumuna ulaşılamadı.</p>
          )}
          <button
            type="button"
            onClick={() => check(true)}
            disabled={state === "checking"}
            className="mt-3 w-full rounded-lg bg-surface-muted px-2 py-1.5 text-xs font-medium text-navy-700 hover:bg-surface-border disabled:opacity-60"
          >
            {state === "checking" ? "Kontrol ediliyor…" : "Yeniden kontrol et"}
          </button>
          <Link href="/ayarlar" className="mt-2 block rounded-lg px-2 py-1.5 text-center text-xs font-semibold text-accent-700 hover:bg-accent-50">Bağlantı ayrıntıları</Link>
        </div>
        </div>
      )}
    </div>
  );
}
