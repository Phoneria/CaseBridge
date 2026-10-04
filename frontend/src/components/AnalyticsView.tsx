"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAnalyticsOverview, getCases } from "@/lib/api";
import { analyticsCaseListHref, caseDetailHref } from "@/lib/filters";
import { CASE_TYPE_LABELS } from "@/lib/labels";
import { useQuickViewHref } from "@/lib/urlState";
import type { AnalyticsOverview, Case } from "@/types";
import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export function AnalyticsView() {
  const router = useRouter();
  const quickViewHref = useQuickViewHref();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [wonCases, setWonCases] = useState<Case[]>([]);
  const [lostCases, setLostCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAnalyticsOverview(),
      getCases({ outcome: "won", include_archived: true }),
      getCases({ outcome: "lost", include_archived: true }),
    ]).then(([overviewResult, wonResult, lostResult]) => {
        if (cancelled) return;
        setOverview(overviewResult);
        setWonCases(wonResult);
        setLostCases(lostResult);
      })
      .catch(() => {
        if (!cancelled) setError("Veriler yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState label="Analitik yükleniyor..." />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return null;

  const categoryData = overview.by_category.map((row) => ({
    key: row.case_type,
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    "Kazanma Oranı": row.win_rate,
    href: analyticsCaseListHref({ kategori: row.case_type }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Analitik</h1>
        <p className="text-sm text-navy-500">Büronuzun tarihsel performansı.</p>
      </div>

      <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-navy-800">Kazanma oranı nasıl hesaplanır?</h2>
        <p className="mt-2 text-sm text-navy-700">Kazanılan dava sayısı ÷ (kazanılan + kaybedilen dava sayısı) × 100. Devam eden ve uzlaşmayla kapanan davalar paydaya girmez. Arşivdeki davalar dahildir; bu oran bir tahmin veya hukuki başarı garantisi değildir.</p>
        <p className="mt-2 text-sm font-medium text-navy-900">{overview.won_cases} ÷ ({overview.won_cases} + {overview.lost_cases}) × 100 = %{overview.win_rate}</p>
        {overview.won_cases + overview.lost_cases === 0 && <p className="mt-1 text-xs text-navy-500">Henüz karara bağlanmış kazanılan veya kaybedilen dava yok; oran %0 olarak gösterilir.</p>}
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Toplam Dava" value={overview.total_cases} href={analyticsCaseListHref()} />
        <StatCard label="Aktif Dava" value={overview.active_cases} href={analyticsCaseListHref({ durum: "aktif" })} />
        <StatCard label="Kazanılan" value={overview.won_cases} href={analyticsCaseListHref({ sonuc: "kazanilan" })} />
        <StatCard label="Kaybedilen" value={overview.lost_cases} href={analyticsCaseListHref({ sonuc: "kaybedilen" })} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent />
        <StatCard label="Ort. Dava Süresi (gün)" value={overview.average_case_duration_days} />
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-medium text-navy-700">Kategoriye Göre Başarı Oranı</p>
        {categoryData.length === 0 ? (
          <EmptyState message="Henüz yeterli veri yok." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
                <YAxis tick={{ fontSize: 11 }} stroke="#3d5170" />
                <Tooltip cursor={{ fill: "#f1eeff" }} />
                <Bar
                  dataKey="Kazanma Oranı"
                  radius={[6, 6, 0, 0]}
                  fill="#6d43f5"
                  cursor="pointer"
                  onClick={(data: unknown) => {
                    const href = (data as { payload?: { href?: string } } | undefined)?.payload?.href;
                    if (href) router.push(href);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegendLinks
              ariaLabel="Kategoriler"
              items={categoryData.map((row) => ({ key: row.key, label: row.name, value: `%${row["Kazanma Oranı"]}`, href: row.href }))}
            />
          </>
        )}
      </div>

      {([{ title: "Kazanılan Davalar", rows: wonCases, empty: "Kazanılan dava bulunmuyor." }, { title: "Kaybedilen Davalar", rows: lostCases, empty: "Kaybedilen dava bulunmuyor." }]).map((group) => (
      <section key={group.title} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h2 className="mb-2 text-sm font-medium text-navy-700">{group.title}</h2>
        <p className="mb-3 text-xs text-navy-500">Hesaplamaya giren dava kayıtları ve mevcut özetleri.</p>
        {group.rows.length === 0 ? (
          <EmptyState message={group.empty} />
        ) : (
          <ul className="divide-y divide-surface-border text-sm">
            {group.rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <Link href={caseDetailHref(c.id)} className="font-medium text-navy-900 hover:text-accent-600">{c.case_name}</Link>
                  <p className="mt-1 line-clamp-2 text-xs text-navy-500">{c.description?.trim() || "Bu dava için özet girilmemiş."}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-navy-500">{c.case_number}</span>
                  <Link
                    href={quickViewHref(c.id)}
                    scroll={false}
                    aria-label={`${c.case_name} önizle`}
                    className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-600 hover:border-accent-400 hover:text-accent-700"
                  >
                    Önizle
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>))}
    </div>
  );
}
