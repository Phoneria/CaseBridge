"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { downloadReportCsv, getAnalyticsOverview, getReportSummary } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { analyticsCaseListHref, caseListHref, taskListHref } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { AnalyticsOverview, ReportKind, ReportSummary } from "@/types";
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

const STATUS_COLORS: Record<string, string> = {
  devam_eden: "#6d43f5",
  durusma_bekleyen: "#f59e0b",
  karar_bekleyen: "#0ea5e9",
  kapali: "#10b981",
};

function ReportsDashboard({ summary, overview }: { summary: ReportSummary; overview: AnalyticsOverview }) {
  const metrics = [
    { label: "Toplam dava", value: summary.total_cases, hint: "Portföydeki tüm dosyalar", href: analyticsCaseListHref(), color: "text-accent-600" },
    { label: "Aktif dava", value: overview.active_cases, hint: "Takibi devam eden", href: analyticsCaseListHref({ durum: "aktif" }), color: "text-emerald-600" },
    { label: "30 günde duruşma", value: summary.upcoming_hearings_30d, hint: "Yaklaşan takvim", href: caseListHref({ durusma: "yaklasan" }), color: "text-amber-600" },
    { label: "Açık görev", value: summary.open_tasks, hint: "Tamamlanmayı bekliyor", href: taskListHref({ durum: "acik" }), color: "text-sky-600" },
  ];
  const statusRows = overview.by_status.filter((row) => row.total > 0).map((row) => ({
    ...row,
    label: CASE_STATUS_LABELS[row.status] ?? row.status,
    color: STATUS_COLORS[row.status] ?? "#94a3b8",
  }));
  let cursor = 0;
  const slices = statusRows.map((row) => {
    const start = cursor;
    cursor += overview.total_cases ? row.total / overview.total_cases * 100 : 0;
    return `${row.color} ${start}% ${Math.min(cursor, 100)}%`;
  });
  const ring = statusRows.length ? `conic-gradient(${slices.join(", ")}, #e6e8ef ${Math.min(cursor, 100)}% 100%)` : "#e6e8ef";
  const categories = [...overview.by_category].filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  const largestCategory = Math.max(...categories.map((row) => row.total), 1);

  return <section aria-label="Hızlı rapor özeti" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="text-base font-semibold text-navy-900">Bir bakışta büro</h2><p className="mt-1 text-xs text-navy-500">Rapor indirmeden güncel iş yükünü görün.</p></div>
      <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Canlı veri</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="group rounded-2xl border border-surface-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-accent-300">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">{metric.label}</p>
        <div className="mt-2 flex items-end justify-between gap-2"><strong className={`text-3xl font-bold tracking-tight ${metric.color}`}>{metric.value.toLocaleString("tr-TR")}</strong><span aria-hidden="true" className="text-accent-500 opacity-0 transition group-hover:opacity-100">↗</span></div>
        <p className="mt-1 text-xs text-navy-500">{metric.hint}</p>
      </Link>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <article className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h3 className="text-sm font-semibold text-navy-900">Dava durumları</h3>
        <p className="mt-1 text-xs text-navy-500">Dosyaların mevcut aşaması</p>
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
          <div role="img" aria-label={`Dava durum dağılımı: ${statusRows.map((row) => `${row.label} ${row.total}`).join(", ") || "Henüz dava yok"}`} className="relative size-40 shrink-0 rounded-full" style={{ background: ring }}>
            <div className="absolute inset-[19px] grid place-content-center rounded-full bg-white text-center"><strong className="text-3xl font-bold text-navy-900">{overview.total_cases}</strong><span className="text-[11px] text-navy-500">toplam dava</span></div>
          </div>
          <div className="w-full space-y-2">{statusRows.length ? statusRows.map((row) => <div key={row.status} className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-navy-700"><span className="size-2.5 rounded-full" style={{ backgroundColor: row.color }} />{row.label}</span><strong className="text-navy-900">{row.total}</strong>
          </div>) : <p className="text-sm text-navy-500">Henüz dava kaydı yok.</p>}</div>
        </div>
      </article>
      <article className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-navy-900">Hukuk alanlarına göre</h3><p className="mt-1 text-xs text-navy-500">Dosya sayısına göre dağılım</p></div><Link href="/analitik" className="text-xs font-medium text-accent-700 hover:underline">Detaylı analiz →</Link></div>
        <div className="mt-5 space-y-3">{categories.length ? categories.map((row) => <Link key={row.case_type} href={analyticsCaseListHref({ kategori: row.case_type })} className="group block" aria-label={`${CASE_TYPE_LABELS[row.case_type] ?? row.case_type}: ${row.total} dava`}>
          <div className="mb-1 flex justify-between gap-3 text-xs"><span className="font-medium text-navy-700 group-hover:text-accent-700">{CASE_TYPE_LABELS[row.case_type] ?? row.case_type}</span><strong className="text-navy-900">{row.total}</strong></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-300" style={{ width: `${row.total / largestCategory * 100}%` }} /></div>
        </Link>) : <p className="text-sm text-navy-500">Henüz kategori verisi yok.</p>}</div>
      </article>
    </div>
  </section>;
}

export function ReportsView() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "error">("loading");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [overviewState, setOverviewState] = useState<"loading" | "ready" | "error">("loading");
  const [downloading, setDownloading] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReportSummary()
      .then((result) => {
        setSummary(result);
        setSummaryState("ready");
      })
      .catch(() => setSummaryState("error"));
    getAnalyticsOverview()
      .then((result) => { setOverview(result); setOverviewState("ready"); })
      .catch(() => setOverviewState("error"));
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
        <p className="text-sm text-navy-500">Büronuzun güncel durumunu indirme yapmadan görün; gerekirse raporları dışa aktarın.</p>
      </div>

      {summaryState === "loading" || overviewState === "loading" ? <div className="rounded-2xl border border-surface-border bg-white p-5 text-sm text-navy-500 shadow-card">Hızlı rapor özeti yükleniyor…</div> : summary && overview ? <ReportsDashboard summary={summary} overview={overview} /> : <div className="rounded-2xl border border-surface-border bg-white p-5 text-sm text-navy-500 shadow-card">Grafik özeti şu anda yüklenemedi. Rapor bağlantılarını yine kullanabilirsiniz.</div>}

      <div className="pt-2"><h2 className="text-base font-semibold text-navy-900">Dışa aktarılabilir raporlar</h2><p className="mt-1 text-xs text-navy-500">Ayrıntılı çalışma için isteğe bağlı CSV dosyaları.</p></div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <article key={report.id} className="flex flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-xl font-semibold text-accent-700">{report.icon}</span>
              {summaryState === "ready" && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Canlı veri</span>
              )}
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
