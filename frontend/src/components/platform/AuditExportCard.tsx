"use client";

import { useRef, useState } from "react";

import { INPUT_CLASS } from "@/components/case-form/Field";
import { downloadAuditCsv } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { userMessage } from "@/lib/userMessages";
import type { PlatformFirm } from "@/types";

const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The server's default range: the last 30 days ending today, as UTC dates. */
export function defaultAuditRange(now: Date): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

const LABEL = "mb-1 block text-xs font-medium text-navy-600";

/** Platform admins download the metadata-only audit log as CSV. */
export function AuditExportCard({ firms }: { firms: PlatformFirm[] }) {
  const initial = defaultAuditRange(new Date());
  const [firmId, setFirmId] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function download() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadAuditCsv({ firmId: firmId || undefined, from, to });
      saveBlob(blob, `casebridge-hareketler-${from}-${to}.csv`);
    } catch (err) {
      setError(userMessage(err, "Kayıtlar indirilemedi."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="platform-audit" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <h2 id="platform-audit" className="mb-1 text-base font-semibold text-navy-900">Hareket kayıtları</h2>
      <p className="mb-4 text-sm text-navy-500">
        Avukatların dava ve AI hareketleri. Yalnızca üst veri içerir; dava adı, müvekkil ve metinler yoktur.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <label htmlFor="audit-firm" className={LABEL}>Büro</label>
          <select id="audit-firm" className={INPUT_CLASS} value={firmId} onChange={(e) => setFirmId(e.target.value)}>
            <option value="">Tüm bürolar</option>
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>{firm.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className={LABEL}>Başlangıç</label>
          <input id="audit-from" type="date" className={INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audit-to" className={LABEL}>Bitiş</label>
          <input id="audit-to" type="date" className={INPUT_CLASS} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" aria-disabled={busy} onClick={download}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-50">
          CSV indir
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
