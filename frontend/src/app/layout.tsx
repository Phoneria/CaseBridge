import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseBridge — Hukuk Bürosu Çalışma Alanı",
  description: "Hukuk büroları için yapay zeka destekli dava yönetimi ve simülasyon platformu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh bg-surface-muted font-sans text-navy-900 antialiased">{children}</body>
    </html>
  );
}
