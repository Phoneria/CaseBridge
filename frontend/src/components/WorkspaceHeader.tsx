"use client";

import Link from "next/link";
import { Suspense } from "react";
import { contextTopic, guideTopics } from "@/lib/workspaceGuide";
import { usePathname, useSearchParams } from "next/navigation";

import { GlobalSearch } from "@/components/GlobalSearch";
import { UpcomingNotifications } from "@/components/UpcomingNotifications";
import { UserMenu } from "@/components/UserMenu";
import type { AppUser } from "@/types";

const PAGE_TITLES: Record<string, string> = {
  "/rehber": "Rehber",
  "/buro": "Büro Yönetimi",
  "/calisma-alanim": "Çalışma Alanım",
  "/admin": "Admin Paneli",
  "/platform": "Büro Yönetimi",
  "/dashboard": "Genel Bakış",
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
  "/ai/anonimlestirme": "Anonimleştirme",
  "/ai/analiz": "Dosya Analizi",
  "/ai/durusma": "Canlı Duruşma",
  "/ai/sohbet": "Hukuk Asistanı",
  "/ai/sufle": "Sufle",
  "/ai/harita": "Bilgi Haritası",
  "/ai/karsi-taraf": "Karşı Taraf Analizi",
  "/ai/yonetmen": "Yönetilen Duruşma",
  "/ai/olasilik": "Olasılık Ağacı",
  "/ai/benzer-davalar": "Benzer Dava Bul",
};

function sectionForPath(pathname: string): { href: string; title: string } | null {
  const key = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { href: key, title: PAGE_TITLES[key] } : null;
}

function GuideLink({ user }: { user: AppUser }) {
  const path = usePathname() ?? "";
  const params = useSearchParams();
  const topic = contextTopic(guideTopics(user), path, params.get("tab"));
  return <Link href={path === "/rehber" ? "/rehber" : "/rehber?konu=" + topic.id}
    aria-current={path === "/rehber" ? "page" : undefined}
    className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-2.5 text-sm font-semibold text-accent-800 hover:border-accent-400">Rehber</Link>;
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
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-4">
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
        <Suspense fallback={null}>{user && <GuideLink user={user} />}</Suspense>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
