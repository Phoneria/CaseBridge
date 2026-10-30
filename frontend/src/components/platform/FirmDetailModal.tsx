"use client";

import { ModalFrame } from "@/components/ModalFrame";
import { NoticeLine, type Notice } from "@/components/platform/NoticeLine";
import type { PlatformAdmin, PlatformFirm, UserStatus } from "@/types";

const STATUS_LABELS: Record<UserStatus, string> = { active: "Aktif", pending: "Davet bekliyor", inactive: "Pasif" };
const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  inactive: "bg-surface-muted text-navy-500",
};
const SECONDARY =
  "rounded-xl border border-surface-border px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60";

/** One firm: its administrators and the platform actions on it. */
export function FirmDetailModal({
  firm,
  notice,
  busy,
  onClose,
  onResend,
  onAddAdmin,
  onToggle,
}: {
  firm: PlatformFirm;
  notice: Notice | null;
  busy: boolean;
  onClose: () => void;
  onResend: (admin: PlatformAdmin) => void;
  onAddAdmin: () => void;
  onToggle: () => void;
}) {
  return (
    <ModalFrame title={firm.name} onClose={onClose} busy={busy} wide>
      <p className="mb-3 text-sm text-navy-600">
        Durum: {firm.is_active ? "Aktif" : "Askıda"} · Aktif kullanıcı: {firm.active_user_count}
      </p>
      {notice && <NoticeLine notice={notice} />}

      <h3 className="mb-2 text-sm font-medium text-navy-700">Yöneticiler</h3>
      <ul className="divide-y divide-surface-border">
        {firm.admins.map((admin) => (
          <li key={admin.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-navy-800">{admin.full_name}</p>
              <p className="truncate text-navy-500">{admin.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[admin.status]}`}>{STATUS_LABELS[admin.status]}</span>
              {admin.status === "pending" && firm.is_active && (
                <button
                  type="button"
                  aria-disabled={busy}
                  aria-label={`Daveti yeniden gönder, ${admin.full_name}`}
                  onClick={() => !busy && onResend(admin)}
                  className={SECONDARY}
                >
                  Daveti yeniden gönder
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-disabled={busy}
          onClick={() => !busy && onToggle()}
          className={
            firm.is_active
              ? "rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              : "rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          }
        >
          {firm.is_active ? "Büroyu askıya al" : "Büroyu aktifleştir"}
        </button>
        <div className="flex gap-2">
          <button type="button" aria-disabled={busy} onClick={() => !busy && onAddAdmin()} className={SECONDARY}>
            Yönetici ekle
          </button>
          <button type="button" aria-disabled={busy} onClick={() => !busy && onClose()} className={SECONDARY}>
            Kapat
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
