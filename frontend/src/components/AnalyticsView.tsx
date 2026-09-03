"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAnalyticsOverview, getCases } from "@/lib/api";
import { CASE_TYPE_LABELS } from "@/lib/labels";
import type { AnalyticsOverview, Case } from "@/types";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export function AnalyticsView() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [lostCases, setLostCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAnalyticsOverview(), getCases()])
      .then(([overviewResult, casesResult]) => {
        if (cancelled) return;
        setOverview(overviewResult);
        setLostCases(casesResult.filter((c) => c.outcome === "lost"));
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
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    "Kazanma Oranı": row.win_rate,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Analitik</h1>
        <p className="text-sm text-navy-500">Büronuzun tarihsel performansı.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Toplam Dava" value={overview.total_cases} />
        <StatCard label="Aktif Dava" value={overview.active_cases} />
        <StatCard label="Kazanılan" value={overview.won_cases} />
        <StatCard label="Kaybedilen" value={overview.lost_cases} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent />
        <StatCard label="Ort. Dava Süresi (gün)" value={overview.average_case_duration_days} />
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-medium text-navy-700">Kategoriye Göre Başarı Oranı</p>
        {categoryData.length === 0 ? (
          <EmptyState message="Henüz yeterli veri yok." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
              <YAxis tick={{ fontSize: 11 }} stroke="#3d5170" />
              <Tooltip />
              <Bar dataKey="Kazanma Oranı" radius={[6, 6, 0, 0]} fill="#6d43f5" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-medium text-navy-700">Kaybedilen Davalar</p>
        {lostCases.length === 0 ? (
          <EmptyState message="Kaybedilen dava bulunmuyor." />
        ) : (
          <ul className="divide-y divide-surface-border text-sm">
            {lostCases.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link href={`/davalar/${c.id}`} className="font-medium text-navy-900 hover:text-accent-600">
                  {c.case_name}
                </Link>
                <span className="text-xs text-navy-500">{c.case_number}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
