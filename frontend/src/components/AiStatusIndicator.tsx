"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getAiConnectivity } from "@/lib/api";
import type { AIConnectivity } from "@/types";

const POLL_MS = 60_000;

type State = "checking" | "online" | "offline";

export function AiStatusIndicator({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [data, setData] = useState<AIConnectivity | null>(null);
  const [state, setState] = useState<State>("checking");
  const [open, setOpen] = useState(false);
  const busy = useRef(false);

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
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
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
        <div className="absolute bottom-full left-0 z-20 w-64 pb-2">
        <div
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
                    {!c.reachable && <span className="block text-red-600">Hizmete şu anda ulaşılamıyor.</span>}
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
        </div>
        </div>
      )}
    </div>
  );
}
