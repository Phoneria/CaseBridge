"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getAnalyticsOverview, getCases, getRecentActivity } from "@/lib/api";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import type { ActivityItem, AnalyticsOverview, Case } from "@/types";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

const CHART_COLORS = ["#6d43f5", "#8b6bff", "#ac96ff", "#cfc4ff", "#4a25b3", "#2f1a6e"];

export function DashboardView() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getAnalyticsOverview(), getCases(), getRecentActivity()])
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
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    total: row.total,
  }));

  const statusCounts = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    name: CASE_STATUS_LABELS[status] ?? status,
    value: count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Dashboard</h1>
        <p className="text-sm text-navy-500">Bürünüzün genel durumuna hızlı bir bakış.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Aktif Davalar" value={overview.active_cases} />
        <StatCard label="Toplam Davalar" value={overview.total_cases} />
        <StatCard label="Kazanılan Davalar" value={overview.won_cases} />
        <StatCard label="Kaybedilen Davalar" value={overview.lost_cases} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Dağılımı</p>
          {categoryData.length === 0 ? (
            <EmptyState message="Henüz kategori verisi yok." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#3d5170" />
                <Tooltip />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#6d43f5" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Durumu Dağılımı</p>
          {statusData.length === 0 ? (
            <EmptyState message="Henüz durum verisi yok." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {statusData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Yaklaşan Duruşmalar</p>
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
                {upcomingHearings.map((c) => (
                  <tr key={c.id} className="border-t border-surface-border">
                    <td className="py-2 text-navy-800">{c.case_name}</td>
                    <td className="py-2 text-navy-600">{c.court ?? "-"}</td>
                    <td className="py-2 text-navy-600">{formatDate(c.next_hearing_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Son Gelişmeler</p>
          {activity.length === 0 ? (
            <EmptyState message="Henüz gelişme yok." />
          ) : (
            <ul className="space-y-3 text-sm">
              {activity.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-navy-800">{item.title}</p>
                    <p className="text-xs text-navy-500">{item.case_name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-navy-400">{formatDate(item.event_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
