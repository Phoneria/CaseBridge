"use client";

import { useState } from "react";

import { downloadCasesCsv } from "@/lib/api";
import { ErrorState } from "@/components/ErrorState";

const reports = [
  {
    id: "cases",
    icon: "⚖",
    title: "Dava Listesi Raporu",
    description: "Tüm davaların numarası, tarafları, türü, durumu ve önemli tarihleri.",
    detail: "20 dava kaydı",
    updated: "Bugün güncellendi",
  },
  {
    id: "hearings",
    icon: "◫",
    title: "Duruşma Takvimi",
    description: "Yaklaşan duruşmaların tarih ve mahkeme bilgilerini içeren kısa plan.",
    detail: "12 yaklaşan duruşma",
    updated: "Bugün güncellendi",
  },
  {
    id: "tasks",
    icon: "✓",
    title: "Görev Durumu Raporu",
    description: "Açık, tamamlanan ve son tarihi yaklaşan görevlerin özet görünümü.",
    detail: "9 açık görev",
    updated: "Bugün güncellendi",
  },
  {
    id: "performance",
    icon: "↗",
    title: "Dava Performans Özeti",
    description: "Sonuçlanan davalar, kazanma oranı ve kategori bazlı performans.",
    detail: "%62,5 kazanma oranı",
    updated: "Bu ay güncellendi",
  },
] as const;

const mockReportCsv: Record<string, string> = {
  hearings: "Tarih,Dava,Mahkeme\n09.09.2026,Ticari Kira Uyarlama Davası,İstanbul 14. Sulh Hukuk Mahkemesi\n11.09.2026,Kat Mülkiyeti Aidat Alacağı,İstanbul 12. İcra Hukuk Mahkemesi\n",
  tasks: "Görev,Dava,Durum\nDuruşma hazırlık notunu tamamla,Kiracı Tahliye Davası,Açık\nAidat hesap tablosunu kontrol et,Kat Mülkiyeti Aidat Alacağı,Açık\n",
  performance: "Gösterge,Değer\nToplam Dava,20\nAktif Dava,12\nKazanılan,5\nKaybedilen,3\nKazanma Oranı,%62.5\n",
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsView() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(reportId: string) {
    setDownloading(reportId);
    setError(null);
    try {
      if (reportId === "cases") {
        saveBlob(await downloadCasesCsv(), "davalar.csv");
      } else {
        const csv = mockReportCsv[reportId];
        saveBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `${reportId}-raporu.csv`);
      }
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
        {reports.map((report) => (
          <article key={report.id} className="flex flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-xl font-semibold text-accent-700">
                {report.icon}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Hazır</span>
            </div>
            <h2 className="text-sm font-semibold text-navy-800">{report.title}</h2>
            <p className="mt-1 min-h-10 text-xs leading-5 text-navy-500">{report.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4 text-xs">
              <div>
                <p className="font-medium text-navy-700">{report.detail}</p>
                <p className="mt-0.5 text-navy-400">{report.updated}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(report.id)}
                disabled={downloading !== null}
                className="rounded-xl bg-accent-600 px-3.5 py-2 font-medium text-white transition hover:bg-accent-700 disabled:opacity-60"
              >
                {downloading === report.id
                  ? "Hazırlanıyor..."
                  : report.id === "cases"
                    ? "CSV Olarak İndir"
                    : "Örnek Raporu İndir"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {error && <ErrorState message={error} />}
    </div>
  );
}
