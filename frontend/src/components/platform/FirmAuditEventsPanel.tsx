"use client";

import { useEffect, useMemo, useState } from "react";

import { defaultAuditRange } from "@/components/platform/AuditExportCard";
import { listFirmAuditEvents, listPlatformFirms } from "@/lib/api";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_ROLE_LABELS,
  auditActionLabel,
  auditTimeLabel,
  describeAuditDetails,
} from "@/lib/auditEvents";
import { CASE_TYPE_LABELS } from "@/lib/labels";
import { CARD, INPUT, SECONDARY } from "@/lib/management";
import { userMessage } from "@/lib/userMessages";
import type { AuditEvent, AuditEventPage } from "@/types";

export const AUDIT_PAGE_SIZE = 50;

interface Filters {
  from: string;
  to: string;
  action: string;
  actorUserId: string;
  caseId: string;
}

const shortId = (id: string) => id.slice(0, 8);
const LINK = "text-left text-accent-700 hover:underline";

/** One firm's metadata-only audit events for platform admins (GET /platform/firms/{id}/audit-events). */
export function FirmAuditEventsPanel({ firmId }: { firmId: string }) {
  const initial = useMemo(() => defaultAuditRange(new Date()), []);
  const [draft, setDraft] = useState({ from: initial.from, to: initial.to, action: "" });
  const [filters, setFilters] = useState<Filters>({ ...initial, action: "", actorUserId: "", caseId: "" });
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AuditEventPage | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Names come from the platform's own firm list; the audit rows hold ids only.
  useEffect(() => {
    let active = true;
    listPlatformFirms()
      .then((firms) => {
        const firm = firms.find((item) => item.id === firmId);
        if (active && firm) {
          setNames(Object.fromEntries([...firm.admins, ...(firm.lawyers ?? [])].map((user) => [user.id, user.full_name])));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [firmId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listFirmAuditEvents(firmId, {
      from: filters.from,
      to: filters.to,
      action: filters.action || undefined,
      actorUserId: filters.actorUserId || undefined,
      caseId: filters.caseId || undefined,
      limit: AUDIT_PAGE_SIZE,
      offset,
    })
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((err) => {
        if (active) setError(userMessage(err, "Hareket kayıtları yüklenemedi."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [firmId, filters, offset]);

  const nameOf = (id: string) => names[id] ?? null;
  const apply = (next: Partial<Filters>) => {
    setOffset(0);
    setFilters((current) => ({ ...current, ...next }));
  };
  const actorLabel = (event: AuditEvent) => {
    if (!event.actor_user_id) return "Sistem";
    const role = event.actor_role ? AUDIT_ROLE_LABELS[event.actor_role] ?? event.actor_role : "Kullanıcı";
    return nameOf(event.actor_user_id) ?? `${role} · ${shortId(event.actor_user_id)}`;
  };
  const topActions = page ? Object.entries(page.by_action).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6) : [];

  return (
    <section aria-labelledby="firm-audit-events" className="space-y-4">
      <div>
        <h2 id="firm-audit-events" className="text-lg font-semibold text-navy-900">Hareket kayıtları</h2>
        <p className="mt-1 text-sm text-navy-500">
          Kullanıcıların dava, belge, görev ve AI hareketleri. Yalnızca üst veri gösterilir; dava adı, müvekkil ve metinler kaydedilmez.
        </p>
      </div>

      <form
        className={`${CARD} grid gap-3 sm:grid-cols-4 sm:items-end`}
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <label className="text-xs text-navy-500">
          Başlangıç
          <input type="date" className={INPUT} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="text-xs text-navy-500">
          Bitiş
          <input type="date" className={INPUT} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <label className="text-xs text-navy-500">
          İşlem
          <select className={INPUT} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Tüm işlemler</option>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {Object.entries(AUDIT_ACTION_LABELS)
                  .filter(([action]) => group.prefix.some((prefix) => action.startsWith(prefix)))
                  .map(([action, label]) => (
                    <option key={action} value={action}>{label}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button className={SECONDARY}>Uygula</button>
      </form>

      {(filters.actorUserId || filters.caseId) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {filters.actorUserId && (
            <button type="button" className="rounded-full bg-accent-50 px-3 py-1 text-accent-700" onClick={() => apply({ actorUserId: "" })}>
              Kullanıcı: {nameOf(filters.actorUserId) ?? shortId(filters.actorUserId)} ×
            </button>
          )}
          {filters.caseId && (
            <button type="button" className="rounded-full bg-accent-50 px-3 py-1 text-accent-700" onClick={() => apply({ caseId: "" })}>
              Dava: {shortId(filters.caseId)} ×
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading && !page && <p className="text-sm text-navy-500">Hareket kayıtları yükleniyor…</p>}

      {page && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={CARD}>
              <p className="text-xs text-navy-500">Toplam hareket</p>
              <p className="mt-2 text-2xl font-semibold text-navy-900">{page.total.toLocaleString("tr-TR")}</p>
            </div>
            {topActions.slice(0, 3).map(([action, count]) => (
              <button key={action} type="button" className={`${CARD} text-left hover:border-accent-300`}
                aria-label={`${auditActionLabel(action)}: ${count} hareket, filtrele`}
                onClick={() => {
                  setDraft((current) => ({ ...current, action }));
                  apply({ action });
                }}>
                <p className="text-xs text-navy-500">{auditActionLabel(action)}</p>
                <p className="mt-2 text-2xl font-semibold text-navy-900">{count.toLocaleString("tr-TR")}</p>
              </button>
            ))}
          </div>

          {page.items.length === 0 ? (
            <p className={`${CARD} text-sm text-navy-500`}>Bu aralıkta ve filtrelerde hareket yok.</p>
          ) : (
            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs text-navy-500">
                    <th className="py-2 pr-3 font-medium">Zaman</th>
                    <th className="py-2 pr-3 font-medium">Kullanıcı</th>
                    <th className="py-2 pr-3 font-medium">İşlem</th>
                    <th className="py-2 pr-3 font-medium">Dava</th>
                    <th className="py-2 font-medium">Ayrıntı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {page.items.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-navy-600">{auditTimeLabel(event.occurred_at)}</td>
                      <td className="py-2 pr-3">
                        {event.actor_user_id ? (
                          <button type="button" className={LINK} onClick={() => apply({ actorUserId: event.actor_user_id ?? "" })}>
                            {actorLabel(event)}
                          </button>
                        ) : actorLabel(event)}
                      </td>
                      <td className="py-2 pr-3 font-medium text-navy-800">{auditActionLabel(event.action)}</td>
                      <td className="py-2 pr-3">
                        {event.case_id ? (
                          <button type="button" className={LINK} onClick={() => apply({ caseId: event.case_id ?? "" })}>
                            {(event.case_type && CASE_TYPE_LABELS[event.case_type]) || event.case_type || "Dava"} · {shortId(event.case_id)}
                          </button>
                        ) : <span className="text-navy-400">—</span>}
                      </td>
                      <td className="py-2 text-xs text-navy-600">{describeAuditDetails(event.details, nameOf).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-navy-500">
            <button type="button" className={SECONDARY} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - AUDIT_PAGE_SIZE))}>
              Önceki
            </button>
            <span>
              {page.total === 0 ? "0" : `${offset + 1}–${Math.min(offset + AUDIT_PAGE_SIZE, page.total)}`} / {page.total.toLocaleString("tr-TR")}
            </span>
            <button type="button" className={SECONDARY} disabled={offset + AUDIT_PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + AUDIT_PAGE_SIZE)}>
              Sonraki
            </button>
          </div>
        </>
      )}
    </section>
  );
}
