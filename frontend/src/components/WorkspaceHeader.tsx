"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/GlobalSearch";
import { UpcomingNotifications } from "@/components/UpcomingNotifications";
import { UserMenu } from "@/components/UserMenu";
import type { AppUser } from "@/types";

const PAGE_TITLES: Record<string, string> = {
  "/buro": "Büro Yönetimi",
  "/calisma-alanim": "Çalışma Alanım",
  "/admin": "Admin Paneli",
  "/platform": "Bürolar",
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
  "/ai/sufle": "Sufle",
};

function sectionForPath(pathname: string): { href: string; title: string } | null {
  const key = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { href: key, title: PAGE_TITLES[key] } : null;
}

export function WorkspaceHeader({ user, onMenuToggle, menuOpen = false }: { user: AppUser | null; onMenuToggle?: () => void; menuOpen?: boolean }) {
  const pathname = usePathname() ?? "";
  const section = sectionForPath(pathname);
  const today = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        {onMenuToggle && <button type="button" onClick={onMenuToggle} aria-label="Ana menüyü aç" aria-haspopup="dialog" aria-expanded={menuOpen}
          className="rounded-xl border border-accent-200 bg-accent-50 p-2.5 text-accent-800 md:hidden">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
        </button>}
        <div>
        <p className="text-xs font-medium text-navy-500">
          CaseBridge /{" "}
          {section ? (
            <Link href={section.href} aria-current={pathname === section.href ? "page" : undefined} className="hover:text-accent-700 hover:underline">
              {section.title}
            </Link>
          ) : (
            "Çalışma Alanı"
          )}
        </p>
        <p className="mt-1 text-sm text-navy-700">{today}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        {/* Firm workspace widgets: the platform firm has no firm data or pages. */}
        {!user?.is_platform_admin && !user?.workspace_position && (
          <>
            <GlobalSearch />
            <UpcomingNotifications />
            <nav aria-label="Hızlı erişim" className="hidden items-center gap-1 text-sm xl:flex">
              <Link href="/takvim" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Takvim</Link>
              <Link href="/gorevler" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Görevler</Link>
            </nav>
          </>
        )}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
