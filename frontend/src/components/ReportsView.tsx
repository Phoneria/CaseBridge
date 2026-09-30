"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { downloadReportCsv, getReportSummary } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { analyticsCaseListHref, caseListHref, taskListHref } from "@/lib/filters";
import type { ReportKind, ReportSummary } from "@/types";
import { ErrorState } from "@/components/ErrorState";

interface ReportCard {
  id: ReportKind;
  icon: string;
  title: string;
  description: string;
  filename: string;
  detail: (summary: ReportSummary) => string;
  href: string;
}

const REPORTS: ReportCard[] = [
  {
    id: "cases",
    icon: "⚖",
    title: "Dava Listesi Raporu",
    description: "Tüm davaların numarası, tarafları, türü, durumu ve önemli tarihleri.",
    filename: "davalar.csv",
    detail: (s) => `${s.total_cases} dava kaydı`,
    href: analyticsCaseListHref(),
  },
  {
    id: "hearings",
    icon: "◫",
    title: "Duruşma Takvimi",
    description: "Önümüzdeki 30 gündeki duruşmaların tarih ve mahkeme bilgileri.",
    filename: "durusmalar.csv",
    detail: (s) => `${s.upcoming_hearings_30d} yaklaşan duruşma (30 gün)`,
    href: caseListHref({ durusma: "yaklasan" }),
  },
  {
    id: "tasks",
    icon: "✓",
    title: "Görev Durumu Raporu",
    description: "Tüm görevlerin dava, son tarih ve durum bilgileri.",
    filename: "gorevler.csv",
    detail: (s) => `${s.open_tasks} açık görev`,
    href: taskListHref({ durum: "acik" }),
  },
  {
    id: "performance",
    icon: "↗",
    title: "Dava Performans Özeti",
    description: "Kazanma oranı ve kategori bazlı kazanılan/kaybedilen dağılımı.",
    filename: "performans.csv",
    detail: (s) => `%${s.win_rate.toLocaleString("tr-TR")} kazanma oranı`,
    href: "/analitik",
  },
];

export function ReportsView() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "error">("loading");
  const [downloading, setDownloading] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReportSummary()
      .then((result) => {
        setSummary(result);
        setSummaryState("ready");
      })
      .catch(() => setSummaryState("error"));
  }, []);

  async function handleDownload(report: ReportCard) {
    setDownloading(report.id);
    setError(null);
    try {
      saveBlob(await downloadReportCsv(report.id), report.filename);
    } catch {
      setError("Rapor indirilemedi. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Raporlar</h1>
        <p className="text-sm text-navy-500">Büronuzun güncel durumunu hazır raporlarla inceleyin ve dışa aktarın.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <article key={report.id} className="flex flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-xl font-semibold text-accent-700">{report.icon}</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Canlı veri</span>
            </div>
            <h2 className="text-sm font-semibold text-navy-800">{report.title}</h2>
            <p className="mt-1 min-h-10 text-xs leading-5 text-navy-500">{report.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4 text-xs">
              <div className="font-medium text-navy-700">
                {summaryState === "loading" && <span className="text-navy-400">…</span>}
                {summaryState === "error" && <span>—</span>}
                {summaryState === "ready" && summary && (
                  <Link href={report.href} className="hover:text-accent-700 hover:underline">
                    {report.detail(summary)}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDownload(report)}
                disabled={downloading !== null}
                className="rounded-xl bg-accent-600 px-3.5 py-2 font-medium text-white transition hover:bg-accent-700 disabled:opacity-60"
              >
                {downloading === report.id ? "Hazırlanıyor..." : "CSV Olarak İndir"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {error && <ErrorState message={error} />}
    </div>
  );
}
