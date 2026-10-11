"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/api";
import type { AppUser } from "@/types";

export function UserMenu({ user }: { user: AppUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const loggingOutRef = useRef(false);

  const name = user?.full_name ?? "Kullanıcı";
  const roleLabel = user?.role === "admin" ? "Yönetici" : "Avukat";
  const initials =
    user?.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") ?? "CB";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    // logout() never rejects: the token is discarded even if the call fails.
    await logout();
    router.replace("/login");
  }

  return (
    <div ref={rootRef} className="relative border-l border-surface-border pl-4">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kullanıcı menüsü, ${name}`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-surface-muted"
      >
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700">
          {initials}
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="block max-w-36 truncate text-sm font-medium text-navy-900">{name}</span>
          <span className="block text-xs text-navy-500">{roleLabel}</span>
        </span>
        <span aria-hidden="true" className="text-xs text-navy-400">▾</span>
      </button>

      {open && (
        <div role="menu" aria-label="Kullanıcı menüsü" className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          <Link
            role="menuitem"
            href="/hesabim"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-navy-700 hover:bg-surface-muted"
          >
            Hesabım
          </Link>
          <button
            type="button"
            role="menuitem"
            aria-disabled={loggingOut}
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60"
          >
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
