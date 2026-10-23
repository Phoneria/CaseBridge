"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/GlobalSearch";
import { UpcomingNotifications } from "@/components/UpcomingNotifications";
import { UserMenu } from "@/components/UserMenu";
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
  "/hesabim": "Hesabım",
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
        <UserMenu user={user} />
      </div>
    </header>
  );
}
