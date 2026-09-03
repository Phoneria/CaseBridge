"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  { label: "Takvim", href: "/takvim", icon: <Icon d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Görevler", href: "/gorevler", icon: <Icon d="M9 11.5 11 13.5 15.5 9M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Belgeler", href: "/belgeler", icon: <Icon d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5" /> },
  { label: "Simülasyonlar", href: "/simulasyonlar", icon: <Icon d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /> },
  { label: "Analitik", href: "/analitik", icon: <Icon d="M4 20V10M11 20V4M18 20v-7" /> },
  { label: "Raporlar", href: "/raporlar", icon: <Icon d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 12h8M8 16h5M8 8h8" /> },
  { label: "Ayarlar", href: "/ayarlar", icon: <Icon d="M10.5 3.5h3l.5 2.3a7 7 0 0 1 1.8 1l2.2-.8 1.5 2.6-1.8 1.5a7 7 0 0 1 0 2.1l1.8 1.5-1.5 2.6-2.2-.8a7 7 0 0 1-1.8 1L13.5 20.5h-3l-.5-2.3a7 7 0 0 1-1.8-1l-2.2.8-1.5-2.6 1.8-1.5a7 7 0 0 1 0-2.1L4 10.3l1.5-2.6 2.2.8a7 7 0 0 1 1.8-1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-surface-border bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">
          CB
        </span>
        <div className="leading-tight">
          <p className="text-base font-semibold text-navy-900">CaseBridge</p>
          <p className="text-[11px] text-navy-500">AI-Powered Legal Intelligence</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent-50 text-accent-700"
                  : "text-navy-600 hover:bg-surface-muted hover:text-navy-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
