import type { ReactNode } from "react";

/** The centred card shared by the pages that need no login: login, forgot
 * password and set password (they live outside AppShell). */
export function AuthCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-white p-8 shadow-card">
        <div className="mb-6">
          <p className="text-base font-semibold text-navy-900">CaseBridge</p>
          <p className="text-[11px] text-navy-500">Hukuk bürosu çalışma alanı</p>
        </div>
        {title && <h1 className="mb-4 text-lg font-semibold text-navy-900">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
export const AUTH_LABEL = "mb-1 block text-sm font-medium text-navy-700";
export const AUTH_BUTTON =
  "w-full rounded-xl bg-accent-600 py-2.5 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60";
