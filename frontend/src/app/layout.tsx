import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ThemeSync } from "@/components/ThemeSync";

export const metadata: Metadata = {
  title: "CaseBridge — Hukuk Bürosu Çalışma Alanı",
  description: "Hukuk büroları için yapay zeka destekli dava yönetimi ve simülasyon platformu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body className="min-h-dvh bg-surface-muted font-sans text-navy-900 antialiased">{children}<ThemeSync /></body>
    </html>
  );
}
