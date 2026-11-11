"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { APP_VERSION } from "@/lib/appVersion";
import { AiMark } from "@/components/ai/AiMark";
import { AiStatusIndicator } from "@/components/AiStatusIndicator";
import { AI_ROUTES } from "@/lib/ai";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" className="h-5 w-5">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <Icon d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { label: "Davalar", href: "/davalar", icon: <Icon d="M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /> },
  { label: "Emsal Kararlar", href: "/emsaller", icon: <Icon d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /> },
  { label: "Takvim", href: "/takvim", icon: <Icon d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Görevler", href: "/gorevler", icon: <Icon d="M9 11.5 11 13.5 15.5 9M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Belgeler", href: "/belgeler", icon: <Icon d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5" /> },
  { label: "Analitik", href: "/analitik", icon: <Icon d="M4 20V10M11 20V4M18 20v-7" /> },
  { label: "Raporlar", href: "/raporlar", icon: <Icon d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 12h8M8 16h5M8 8h8" /> },
];

const SETTINGS_ITEM: NavItem = {
  label: "Ayarlar",
  href: "/ayarlar",
  icon: <Icon d="M10.5 3.5h3l.5 2.3a7 7 0 0 1 1.8 1l2.2-.8 1.5 2.6-1.8 1.5a7 7 0 0 1 0 2.1l1.8 1.5-1.5 2.6-2.2-.8a7 7 0 0 1-1.8 1L13.5 20.5h-3l-.5-2.3a7 7 0 0 1-1.8-1l-2.2.8-1.5-2.6 1.8-1.5a7 7 0 0 1 0-2.1L4 10.3l1.5-2.6 2.2.8a7 7 0 0 1 1.8-1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
};

const PLATFORM_ITEM: NavItem = {
  label: "Bürolar",
  href: "/platform",
  icon: <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2" />,
};

const ACCOUNT_ITEM: NavItem = {
  label: "Hesabım",
  href: "/hesabim",
  icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
};

const AI_ITEMS = [
  { label: "Sufle", href: AI_ROUTES.sufle },
  { label: "Dosya Analizi", href: AI_ROUTES.analysis },
  { label: "Canlı Duruşma", href: AI_ROUTES.courtroom },
  { label: "Hukuk Asistanı", href: AI_ROUTES.chat },
];

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent-600 text-white shadow-card"
          : "text-navy-700 hover:bg-accent-100 hover:text-accent-800"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

export function Sidebar({ role, platform = false, restricted = false }: { role?: "admin" | "lawyer"; platform?: boolean; restricted?: boolean }) {
  const pathname = usePathname();
  const inAi = isActive(pathname, AI_ROUTES.hub);
  const hubActive = pathname === AI_ROUTES.hub;

  return (
    <aside className={`flex h-full w-full shrink-0 flex-col border-r px-4 py-5 ${platform ? "border-slate-200 bg-white [&_nav_a]:rounded-md [&_nav_a]:shadow-none" : "border-accent-200 bg-accent-50"}`}>
      <div className="mb-6 shrink-0 px-2"><BrandLogo /></div>

      <div className="min-h-0 flex flex-1 flex-col">

      {restricted ? (
        <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
          <NavLink item={{label:"Çalışma Alanım",href:"/calisma-alanim",icon:<Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2"/>}} pathname={pathname}/>
          <div className="mt-auto pt-4"><NavLink item={ACCOUNT_ITEM} pathname={pathname}/></div>
        </nav>
      ) : platform ? (
        <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
          <NavLink item={PLATFORM_ITEM} pathname={pathname} />
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <NavLink item={ACCOUNT_ITEM} pathname={pathname} />
            <NavLink item={SETTINGS_ITEM} pathname={pathname} />
          </div>
        </nav>
      ) : (
      <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
        <div className="flex min-h-full flex-col">
        <div className="shrink-0 space-y-1">
        {role === "admin" && <NavLink item={{label:"Büro Yönetimi",href:"/buro",icon:<Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2"/>}} pathname={pathname}/>}
        {role === "lawyer" && <NavLink item={{label:"Çalışma Alanım",href:"/calisma-alanim",icon:<Icon d="M9 11.5 11 13.5 15.5 9M5 6h14v14H5z"/>}} pathname={pathname}/>}
        {role === "admin" && (
          <NavLink item={{ label: "Admin Paneli", href: "/admin", icon: <Icon d="M12 3 4 7v5c0 5 3 8 8 10 5-2 8-5 8-10V7l-8-4ZM9 12l2 2 4-4" /> }} pathname={pathname} />
        )}
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        </div>

        <div className="mt-auto shrink-0 pt-4">
        <div
          role="group"
          aria-label="CaseBridge AI"
          className={`relative overflow-hidden rounded-2xl border border-white/10 bg-navy-950 p-2 ${inAi ? "ring-2 ring-accent-400" : ""}`}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ai-glow opacity-70" />
          <Link
            href={AI_ROUTES.hub}
            aria-current={hubActive ? "page" : undefined}
            className={`relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
              hubActive ? "bg-white/15" : "hover:bg-white/10"
            }`}
          >
            <AiMark className="h-4 w-4 text-accent-300" />
            CaseBridge AI
          </Link>
          {AI_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center rounded-xl py-1.5 pl-9 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
                  active ? "bg-white/15 font-medium text-white" : "text-accent-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        </div>
        </div>
        </div>
        <div className="mt-auto flex shrink-0 flex-col gap-2 pt-4">
          <AiStatusIndicator />
          <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        </div>
      </nav>
      )}
      </div>
      <p className="mt-4 shrink-0 border-t border-accent-200 px-3 pt-3 text-xs font-medium text-navy-500" aria-label={`Uygulama sürümü ${APP_VERSION}`}>v.{APP_VERSION}</p>
    </aside>
  );
}
