"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAiConnectivity } from "@/lib/api";
import { connectivityMessage } from "@/lib/aiConnectivity";
import type { AIConnectivity } from "@/types";
import { AiKeySettings } from "@/components/AiKeySettings";

export function AiConnectionPanel({ canManageSecrets = false }: { canManageSecrets?: boolean }) {
  const [data, setData] = useState<AIConnectivity | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const check = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setFailed(false);
    try {
      const result = await getAiConnectivity(force);
      if (mounted.current) setData(result);
    } catch {
      if (mounted.current) { setData(null); setFailed(true); }
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    return () => { mounted.current = false; };
  }, [check]);

  return (
    <section aria-labelledby="settings-ai-connection" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="settings-ai-connection" className="text-sm font-semibold text-navy-900">Yapay Zeka Durumu</h2>
        <button type="button" onClick={() => void check(true)} disabled={checking} className="rounded-xl border border-accent-200 bg-accent-50 px-3 py-2 text-sm font-medium text-accent-800 hover:bg-accent-100 disabled:opacity-60">
          {checking ? "Kontrol ediliyor…" : "Bağlantıyı yeniden kontrol et"}
        </button>
      </div>
      {checking && <p role="status" className="mt-3 text-sm text-navy-500">AI bağlantısı kontrol ediliyor…</p>}
      {!checking && failed && <p role="alert" className="mt-3 text-sm text-red-700">Bağlantı durumu alınamadı. Yeniden deneyin.</p>}
      {!checking && data && <>
        <p role="status" className={`mt-3 text-sm font-medium ${data.connected ? "text-emerald-700" : "text-navy-700"}`}>{data.connected ? "AI hizmetlerine bağlantı doğrulandı." : "AI bağlantısı için işlem gerekiyor."}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.checks.map((item) => <li key={item.name} className="rounded-xl border border-surface-border bg-surface-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy-900"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${item.reachable ? "bg-emerald-500" : "bg-amber-500"}`} />{item.name}</p>
            <p className="mt-2 text-sm leading-6 text-navy-600">{connectivityMessage(item)}</p>
          </li>)}
        </ul>
        <p className="mt-4 text-xs leading-5 text-navy-500">Bu kontrol hizmete erişimi doğrular. Yanıt üretimi ayrıca kullanım kotasına ve model erişimine bağlıdır.</p>
      </>}
      {canManageSecrets && <AiKeySettings onSaved={(result) => { setData(result); setChecking(false); setFailed(false); }} />}
    </section>
  );
}
