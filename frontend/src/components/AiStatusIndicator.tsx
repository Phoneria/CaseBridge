"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getAiConnectivity, getAiUsage } from "@/lib/api";
import type { AIConnectivity, AIUsage } from "@/types";

const POLL_MS = 60_000;

type State = "checking" | "online" | "offline";

export function AiStatusIndicator() {
  const [data, setData] = useState<AIConnectivity | null>(null);
  const [state, setState] = useState<State>("checking");
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    getAiUsage().then(setUsage).catch(() => setUsage(null));
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
  const providers = data ? Array.from(new Set(data.checks.map((c) => c.provider))).join(" · ") : "Sunucuya ulaşılamadı";

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
        className="flex w-full items-center gap-3 rounded-xl border border-surface-border px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {state !== "checking" && (
            <span aria-hidden="true" className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${ring}`} />
          )}
          <span aria-hidden="true" className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-xs font-semibold text-navy-900">{label}</span>
          <span className="block truncate text-[11px] text-navy-500">{providers}</span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 w-64 pb-2">
        <div
          role="dialog"
          aria-label="AI bağlantı ayrıntıları"
          className="rounded-xl border border-surface-border bg-white p-3 shadow-lg"
        >
          <UsageBar usage={usage} />
          {data ? (
            <ul className="flex flex-col gap-2">
              {data.checks.map((c) => (
                <li key={c.name} className="flex gap-2 text-xs">
                  <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.reachable ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy-900">
                      {c.name} · {c.provider}
                    </span>
                    <span className="block truncate text-navy-500">{c.model}</span>
                    {c.detail && <span className="block text-red-600">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600">Backend sunucusuna ulaşılamadı.</p>
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

function formatTokens(n: number): string {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function UsageBar({ usage }: { usage: AIUsage | null }) {
  if (!usage) return null;
  const pct = usage.remaining_percent;
  const bar = pct === null ? "" : pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="mb-3 border-b border-surface-border pb-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-navy-900">Kalan token</span>
        <span className="font-semibold text-navy-900" data-testid="ai-remaining">
          {usage.unlimited ? "Sınırsız" : pct !== null ? `%${pct}` : "Bütçe yok"}
        </span>
      </div>
      {pct !== null && !usage.unlimited && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-1 text-[11px] text-navy-500">
        Bu ay: {formatTokens(usage.used_tokens)}
        {usage.budget_tokens ? ` / ${formatTokens(usage.budget_tokens)}` : ""} token
        {usage.unlimited ? " · lokal model" : ""}
      </p>
    </div>
  );
}
