"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAnalyticsOverview, getCases, getRecentActivity } from "@/lib/api";
import { UPCOMING_HEARING_DAYS, analyticsCaseListHref, caseListHref, daysUntil } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref } from "@/lib/urlState";
import type { ActivityItem, AnalyticsOverview, Case } from "@/types";
import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { DashboardAiCard } from "@/components/ai/DashboardAiCard";

const CHART_COLORS = ["#6d43f5", "#8b6bff", "#ac96ff", "#cfc4ff", "#4a25b3", "#2f1a6e"];

function hrefFromChartEvent(data: unknown): string | undefined {
  return (data as { payload?: { href?: string } } | undefined)?.payload?.href;
}

export function DashboardView() {
  const router = useRouter();
  const quickViewHref = useQuickViewHref();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getAnalyticsOverview(), getCases({ hearing_within_days: UPCOMING_HEARING_DAYS }), getRecentActivity()])
      .then(([overviewResult, casesResult, activityResult]) => {
        if (cancelled) return;
        setActivity(activityResult);
        setOverview(overviewResult);
        setCases(casesResult);
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

  if (loading) return <LoadingState label="Dashboard yükleniyor..." />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return null;

  const upcomingHearings = cases
    .filter((c) => c.next_hearing_date)
    .sort((a, b) => (a.next_hearing_date! < b.next_hearing_date! ? -1 : 1))
    .slice(0, 6);

  const categoryData = overview.by_category.map((row) => ({
    key: row.case_type,
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    total: row.total,
    href: analyticsCaseListHref({ kategori: row.case_type }),
  }));

  const statusData = (overview.by_status ?? []).map((row, index) => ({
    key: row.status,
    name: CASE_STATUS_LABELS[row.status] ?? row.status,
    value: row.total,
    href: analyticsCaseListHref({ durum: row.status }),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const lawyerData = (overview.by_lawyer ?? []).filter((row) => row.lawyer_id).map((row) => ({
    key: row.lawyer_id!,
    name: row.full_name,
    department: row.department,
    total: row.total,
    won: row.won,
    lost: row.lost,
    href: analyticsCaseListHref({ avukat: row.lawyer_id! }),
  }));

  function openFromChart(data: unknown) {
    const href = hrefFromChartEvent(data);
    if (href) router.push(href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Dashboard</h1>
        <p className="text-sm text-navy-500">Bürünüzün genel durumuna hızlı bir bakış.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Aktif Davalar" value={overview.active_cases} href={analyticsCaseListHref({ durum: "aktif" })} />
        <StatCard label="Toplam Davalar" value={overview.total_cases} href={analyticsCaseListHref()} />
        <StatCard label="Kazanılan Davalar" value={overview.won_cases} href={analyticsCaseListHref({ sonuc: "kazanilan" })} />
        <StatCard label="Kaybedilen Davalar" value={overview.lost_cases} href={analyticsCaseListHref({ sonuc: "kaybedilen" })} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent href="/analitik" />
      </div>

      <DashboardAiCard />

      {lawyerData.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Avukata Göre Davalar</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lawyerData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#3d5170" />
              <Tooltip />
              <Bar dataKey="total" name="Toplam" fill="#6d43f5" radius={[6, 6, 0, 0]} cursor="pointer" onClick={openFromChart} />
              <Bar dataKey="won" name="Kazanılan" fill="#10b981" radius={[6, 6, 0, 0]} cursor="pointer" onClick={openFromChart} />
              <Bar dataKey="lost" name="Kaybedilen" fill="#f97373" radius={[6, 6, 0, 0]} cursor="pointer" onClick={openFromChart} />
            </BarChart>
          </ResponsiveContainer>
          <ChartLegendLinks
            ariaLabel="Avukata göre dava dağılımı"
            items={lawyerData.map((row) => ({ key: row.key, label: `${row.name}${row.department ? ` · ${row.department}` : ""}`, value: row.total, href: row.href }))}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Dağılımı</p>
          {categoryData.length === 0 ? (
            <EmptyState message="Henüz kategori verisi yok." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#3d5170" />
                  <Tooltip cursor={{ fill: "#f1eeff" }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#6d43f5" cursor="pointer" onClick={openFromChart} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLegendLinks
                ariaLabel="Dava dağılımı kategorileri"
                items={categoryData.map((row) => ({ key: row.key, label: row.name, value: row.total, href: row.href }))}
              />
            </>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Durumu Dağılımı</p>
          {statusData.length === 0 ? (
            <EmptyState message="Henüz durum verisi yok." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} cursor="pointer" onClick={openFromChart}>
                    {statusData.map((row) => (
                      <Cell key={row.key} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ChartLegendLinks
                ariaLabel="Dava durumları"
                items={statusData.map((row) => ({ key: row.key, label: row.name, value: row.value, href: row.href, color: row.color }))}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-navy-700">Yaklaşan Duruşmalar</p>
            <Link href={caseListHref({ durusma: "yaklasan" })} className="text-xs font-medium text-accent-700 hover:text-accent-800">
              Tümü →
            </Link>
          </div>
          {upcomingHearings.length === 0 ? (
            <EmptyState message="Yaklaşan duruşma bulunmuyor." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-navy-500">
                  <th className="pb-2 font-medium">Dava</th>
                  <th className="pb-2 font-medium">Mahkeme</th>
                  <th className="pb-2 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {upcomingHearings.map((c) => {
                  const days = daysUntil(c.next_hearing_date!);
                  return (
                    <tr
                      key={c.id}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a")) return;
                        router.push(quickViewHref(c.id), { scroll: false });
                      }}
                      className="cursor-pointer border-t border-surface-border hover:bg-surface-muted"
                    >
                      <td className="py-2">
                        <Link href={quickViewHref(c.id)} scroll={false} className="text-navy-800 hover:text-accent-700">
                          {c.case_name}
                        </Link>
                      </td>
                      <td className="py-2 text-navy-600">{c.court || "—"}</td>
                      <td className="py-2 text-navy-600">
                        {formatDate(c.next_hearing_date)}
                        {days >= 0 && days <= 7 && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Bu hafta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Son Gelişmeler</p>
          {activity.length === 0 ? (
            <EmptyState message="Henüz gelişme yok." />
          ) : (
            <ul className="space-y-1 text-sm">
              {activity.map((item) => (
                <li key={item.id}>
                  <Link
                    href={quickViewHref(item.case_id, { type: "olay", id: item.id })}
                    scroll={false}
                    className="flex items-start justify-between gap-3 rounded-lg p-2 hover:bg-surface-muted"
                  >
                    <div>
                      <p className="font-medium text-navy-800">{item.title}</p>
                      <p className="text-xs text-navy-500">{item.case_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-navy-400">{formatDate(item.event_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
