"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/GlobalSearch";
import { UpcomingNotifications } from "@/components/UpcomingNotifications";
import type { AppUser } from "@/types";

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Admin Paneli",
  "/dashboard": "Dashboard",
  "/davalar": "Davalar",
  "/emsaller": "Emsal Kararlar",
  "/takvim": "Takvim",
  "/gorevler": "Görevler",
  "/belgeler": "Belgeler",
  "/analitik": "Analitik",
  "/raporlar": "Raporlar",
  "/ayarlar": "Ayarlar",
  "/ai": "CaseBridge AI",
  "/ai/analiz": "Dosya Analizi",
  "/ai/durusma": "Canlı Duruşma",
  "/ai/sohbet": "Hukuk Asistanı",
};

function titleForPath(pathname: string): string {
  const key = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PAGE_TITLES[key] : "Çalışma Alanı";
}

export function WorkspaceHeader({ user }: { user: AppUser | null }) {
  const pathname = usePathname() ?? "";
  const today = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const initials = user?.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") ?? "CB";

  return (
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[#E6E8EF] bg-[#FAF9F7] px-6 py-4 lg:px-8">
      <div>
        <p className="text-xs font-medium text-navy-500">CaseBridge / {titleForPath(pathname)}</p>
        <p className="mt-1 text-sm text-navy-700">{today}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <GlobalSearch />
        <UpcomingNotifications />
        <nav aria-label="Hızlı erişim" className="flex items-center gap-1 text-sm">
          <Link href="/takvim" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Takvim</Link>
          <Link href="/gorevler" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Görevler</Link>
        </nav>
        <div className="flex items-center gap-2 border-l border-surface-border pl-4">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700">{initials}</span>
          <div className="min-w-0 leading-tight">
            <p className="max-w-36 truncate text-sm font-medium text-navy-900">{user?.full_name ?? "Kullanıcı"}</p>
            <p className="text-xs text-navy-500">{user?.role === "admin" ? "Yönetici" : "Avukat"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
