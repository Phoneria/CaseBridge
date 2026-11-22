"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { AI_NAVIGATION, aiLinkActive } from "@/lib/aiNavigation";
import { AiMark } from "@/components/ai/AiMark";
import { APP_VERSION } from "@/lib/appVersion";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" className="h-4 w-4 shrink-0">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Genel Bakış", href: "/dashboard", icon: <Icon d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
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
  label: "Büro Yönetimi",
  href: "/platform",
  icon: <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2" />,
};

const ACCOUNT_ITEM: NavItem = {
  label: "Hesabım",
  href: "/hesabim",
  icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
};



function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = item.href.startsWith("/ai") ? aiLinkActive(pathname ?? "", item.href) : isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-6 items-center gap-2 rounded-lg px-2 py-0.5 text-[13px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1 ${
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

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-accent-200 bg-accent-50 px-3 py-3">
      <div className="mb-2 shrink-0 px-1 [&_img]:w-36 [&>span]:px-1 [&>span]:py-0.5"><BrandLogo /></div>

      <div className="min-h-0 flex flex-1 flex-col">

      {restricted ? (
        <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
          <NavLink item={{label:"Çalışma Alanım",href:"/calisma-alanim",icon:<Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2"/>}} pathname={pathname}/>
          <div className="mt-auto pt-2"><NavLink item={ACCOUNT_ITEM} pathname={pathname}/></div>
        </nav>
      ) : platform ? (
        <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
          <NavLink item={PLATFORM_ITEM} pathname={pathname} />
          <div className="mt-auto flex flex-col gap-1 pt-2">
            <NavLink item={ACCOUNT_ITEM} pathname={pathname} />
            <NavLink item={SETTINGS_ITEM} pathname={pathname} />
          </div>
        </nav>
      ) : (
      <nav aria-label="Ana menü" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
        <div className="flex min-h-full flex-col">
        <div className="shrink-0 space-y-0">
        {role === "admin" && <NavLink item={{label:"Büro Yönetimi",href:"/buro",icon:<Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2"/>}} pathname={pathname}/>}
        {role === "lawyer" && <NavLink item={{label:"Çalışma Alanım",href:"/calisma-alanim",icon:<Icon d="M9 11.5 11 13.5 15.5 9M5 6h14v14H5z"/>}} pathname={pathname}/>}
        {role === "admin" && (
          <NavLink item={{ label: "Admin Paneli", href: "/admin", icon: <Icon d="M12 3 4 7v5c0 5 3 8 8 10 5-2 8-5 8-10V7l-8-4ZM9 12l2 2 4-4" /> }} pathname={pathname} />
        )}
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        </div>
        <section role="group" aria-label="CaseBridge AI" className="mt-1 shrink-0 rounded-xl bg-white px-1 py-1">
          <h2 className="mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold leading-4 tracking-wide text-navy-600"><AiMark className="h-3.5 w-3.5 text-navy-500" />CaseBridge AI</h2>
          <div className="space-y-0">{AI_NAVIGATION.map(item => <NavLink key={item.href} item={{...item, icon:<AiMark className="h-4 w-4 shrink-0" />}} pathname={pathname} />)}</div>
        </section>
        </div>
        </div>
        <div className="mt-auto flex shrink-0 flex-col gap-1 pt-2">
          <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        </div>
      </nav>
      )}
      </div>
      <p className="mt-2 shrink-0 border-t border-accent-200 px-2 pt-2 text-xs font-medium text-navy-500" aria-label={`Uygulama sürümü ${APP_VERSION}`}>v.{APP_VERSION}</p>
    </aside>
  );
}
