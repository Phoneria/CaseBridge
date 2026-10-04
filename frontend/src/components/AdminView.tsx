"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { assignCaseLawyer, getCases, getMe, listAdminLawyers } from "@/lib/api";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import type { AppUser, Case } from "@/types";

const SELECT_CLASS = "w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-xs font-medium text-navy-800 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60";
const TOOLTIP_STYLE = { border: "1px solid #e6e8ef", borderRadius: 12, boxShadow: "0 8px 24px rgba(15,26,46,.08)", fontSize: 12 };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
}

function caseStatus(status: Case["status"]) {
  if (status === "kapali") return { label: "Kapalı", dot: "bg-slate-300", edge: "border-l-slate-300" };
  if (status === "durusma_bekleyen") return { label: "Duruşma bekliyor", dot: "bg-amber-400", edge: "border-l-amber-400" };
  if (status === "karar_bekleyen") return { label: "Karar bekliyor", dot: "bg-orange-400", edge: "border-l-orange-400" };
  return { label: "Aktif", dot: "bg-emerald-500", edge: "border-l-emerald-500" };
}

function buildTrend(cases: Case[]) {
  const validDates = cases.map((item) => new Date(item.opening_date)).filter((date) => !Number.isNaN(date.getTime()));
  const latest = validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : new Date();
  latest.setDate(1);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(latest.getFullYear(), latest.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      ay: new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(date),
      dava: cases.filter((item) => typeof item.opening_date === "string" && item.opening_date.startsWith(key)).length,
    };
  });
}

function MetricCard({ label, value, detail, tone = "violet" }: { label: string; value: string | number; detail: string; tone?: "violet" | "green" | "amber" | "navy" }) {
  const tones = { violet: "from-accent-600 to-accent-400", green: "from-emerald-600 to-emerald-400", amber: "from-amber-500 to-orange-400", navy: "from-navy-800 to-navy-600" };
  return <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-white p-4 shadow-card">
    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[tone]}`} />
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-400">{label}</p>
    <p className="mt-2 text-3xl font-bold tracking-tight text-navy-900">{value}</p>
    <p className="mt-1 text-xs text-navy-500">{detail}</p>
  </div>;
}

export function AdminView() {
  const [lawyers, setLawyers] = useState<AppUser[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe().then(async (me) => {
      if (me.role !== "admin") {
        if (!cancelled) setDenied(true);
        return;
      }
      const [lawyerRows, caseRows] = await Promise.all([listAdminLawyers(), getCases({ include_archived: true })]);
      if (!cancelled) { setLawyers(lawyerRows); setCases(caseRows); }
    }).catch(() => {
      if (!cancelled) setError("Admin verileri yüklenemedi.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function assign(caseId: string, lawyerId: string) {
    setSavingId(caseId);
    setError(null);
    try {
      const updated = await assignCaseLawyer(caseId, lawyerId);
      setCases((current) => current.map((item) => item.id === caseId ? updated : item));
    } catch {
      setError("Dava avukata atanamadı. Lütfen tekrar deneyin.");
    } finally {
      setSavingId(null);
    }
  }

  const trendData = useMemo(() => buildTrend(cases), [cases]);
  const activeCases = cases.filter((item) => item.status !== "kapali").length;
  const assignedCases = cases.filter((item) => item.assigned_lawyer_id).length;
  const unassignedCases = cases.length - assignedCases;
  const assignmentRate = cases.length ? Math.round((assignedCases / cases.length) * 100) : 0;
  const workloadData = lawyers.map((lawyer) => {
    const rows = cases.filter((item) => item.assigned_lawyer_id === lawyer.id);
    return { name: lawyer.full_name.split(" ")[0], fullName: lawyer.full_name, aktif: rows.filter((item) => item.status !== "kapali").length, kapali: rows.filter((item) => item.status === "kapali").length };
  });
  const busiest = [...workloadData].sort((a, b) => (b.aktif + b.kapali) - (a.aktif + a.kapali))[0];
  const statusData = [
    { name: "Aktif", value: cases.filter((item) => item.status === "devam_eden").length, color: "#10b981" },
    { name: "Duruşma", value: cases.filter((item) => item.status === "durusma_bekleyen").length, color: "#f59e0b" },
    { name: "Karar", value: cases.filter((item) => item.status === "karar_bekleyen").length, color: "#f97316" },
    { name: "Kapalı", value: cases.filter((item) => item.status === "kapali").length, color: "#94a3b8" },
  ].filter((row) => row.value > 0);

  if (loading) return <LoadingState label="Admin paneli yükleniyor..." />;
  if (denied) return <ErrorState message="Bu alan yalnızca yöneticiler içindir." />;
  if (error && cases.length === 0) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Operasyon merkezi</p>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">Dava Sorumluları</h1>
          <p className="mt-1 text-sm text-navy-500">İş yükünü görün, dengeyi koruyun ve dava sahipliğini yönetin.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-2 shadow-sm">
          <span className={`h-2 w-2 rounded-full ${unassignedCases ? "bg-amber-400" : "bg-emerald-500"}`} />
          <span className="text-xs font-medium text-navy-700">{unassignedCases ? `${unassignedCases} dava atama bekliyor` : "Tüm davalar atandı"}</span>
        </div>
      </div>
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Toplam portföy" value={cases.length} detail={`${activeCases} aktif dava`} />
        <MetricCard label="Atama oranı" value={`%${assignmentRate}`} detail={`${assignedCases}/${cases.length} dava sahipli`} tone="green" />
        <MetricCard label="Atama bekleyen" value={unassignedCases} detail={unassignedCases ? "Aksiyon gerekiyor" : "Kuyruk temiz"} tone="amber" />
        <MetricCard label="En yoğun avukat" value={busiest?.name ?? "—"} detail={busiest ? `${busiest.aktif + busiest.kapali} toplam dava` : "Henüz veri yok"} tone="navy" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div className="mb-5 flex items-start justify-between">
            <div><h2 className="text-sm font-semibold text-navy-800">Yeni Dava Trendi</h2><p className="mt-1 text-xs text-navy-500">Son altı aydaki portföy girişi</p></div>
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-[10px] font-semibold text-accent-700">6 AY</span>
          </div>
          <div className="h-64" aria-label="Yeni dava trend grafiği">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs><linearGradient id="caseTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d43f5" stopOpacity={0.32}/><stop offset="100%" stopColor="#6d43f5" stopOpacity={0.02}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
                <XAxis dataKey="ay" tick={{ fontSize: 11, fill: "#3d5170" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#3d5170" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#cfc4ff" }} />
                <Area type="monotone" dataKey="dava" name="Yeni dava" stroke="#6d43f5" strokeWidth={3} fill="url(#caseTrend)" activeDot={{ r: 5, fill: "#6d43f5", stroke: "white", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div><h2 className="text-sm font-semibold text-navy-800">Durum Dağılımı</h2><p className="mt-1 text-xs text-navy-500">Portföyün anlık görünümü</p></div>
          <div className="relative h-52" aria-label="Dava durum dağılımı grafiği">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={83} paddingAngle={3} stroke="none">{statusData.map((row) => <Cell key={row.name} fill={row.color} />)}</Pie><Tooltip contentStyle={TOOLTIP_STYLE} /></PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><p className="text-2xl font-bold text-navy-900">{cases.length}</p><p className="text-[10px] uppercase tracking-wide text-navy-400">Dava</p></div></div>
          </div>
          <div className="grid grid-cols-2 gap-2">{statusData.map((row) => <div key={row.name} className="flex items-center justify-between rounded-lg bg-surface-muted px-2.5 py-2 text-xs"><span className="flex items-center gap-1.5 text-navy-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />{row.name}</span><strong className="text-navy-800">{row.value}</strong></div>)}</div>
        </section>
      </div>

      <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-navy-800">Avukat İş Yükü</h2><p className="mt-1 text-xs text-navy-500">Aktif ve kapanmış davaların sorumlu bazında karşılaştırması</p></div>
          <div className="flex gap-4 text-[11px] text-navy-500"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-600" />Aktif</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent-100" />Kapalı</span></div>
        </div>
        <div className="h-64" aria-label="Avukat iş yükü bar grafiği">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workloadData} layout="vertical" margin={{ top: 0, right: 18, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#3d5170" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={74} tick={{ fontSize: 11, fill: "#1d2d47" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f7f8fb" }} />
              <Bar dataKey="aktif" name="Aktif" stackId="cases" fill="#6d43f5" radius={[6, 0, 0, 6]} />
              <Bar dataKey="kapali" name="Kapalı" stackId="cases" fill="#e7e3ff" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col gap-4 border-b border-surface-border bg-gradient-to-r from-white to-accent-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-navy-800">Atama Panosu</h2><p className="mt-1 text-xs text-navy-500">Davaları avukatlar arasında hızlıca yeniden dağıtın</p></div>
          <div className="min-w-44"><div className="mb-1.5 flex justify-between text-[11px] font-medium text-navy-500"><span>Atama oranı</span><span>{assignedCases}/{cases.length}</span></div><div className="h-2 overflow-hidden rounded-full bg-white shadow-inner"><div className="h-full rounded-full bg-accent-600" style={{ width: `${assignmentRate}%` }} /></div></div>
        </div>
        <div className="overflow-x-auto p-5">
          <div className="grid min-w-max auto-cols-[270px] grid-flow-col gap-3">
            {[...lawyers.map((lawyer) => ({ id: lawyer.id, name: lawyer.full_name, department: lawyer.department })), { id: "", name: "Atanmamış", department: "Sorumlu bekleyen davalar" }].map((owner) => {
              const ownerCases = cases.filter((item) => (item.assigned_lawyer_id ?? "") === owner.id);
              return <div key={owner.id || "unassigned"} className={`rounded-2xl border p-3 ${owner.id ? "border-surface-border bg-surface-muted/60" : "border-amber-200 bg-amber-50/60"}`}>
                <div className="mb-3 flex items-center gap-2.5 px-1"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${owner.id ? "bg-accent-100 text-accent-700" : "bg-amber-100 text-amber-700"}`}>{owner.id ? initials(owner.name) : "?"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-navy-800">{owner.name}</p><p className="truncate text-[10px] text-navy-500">{owner.department ?? "Bölüm belirtilmemiş"}</p></div><span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-[10px] font-bold text-navy-700 shadow-sm">{ownerCases.length}</span></div>
                <div className="space-y-2">
                  {ownerCases.map((item) => {
                    const status = caseStatus(item.status);
                    return <article key={item.id} className={`rounded-xl border border-surface-border border-l-4 ${status.edge} bg-white p-3 shadow-sm`}>
                      <div className="flex items-start justify-between gap-2"><Link href={`/davalar/${item.id}`} className="line-clamp-2 text-xs font-semibold leading-5 text-navy-800 hover:text-accent-700">{item.case_name}</Link><span className="shrink-0 text-[9px] text-navy-400">{item.case_number}</span></div>
                      <div className="my-2 flex items-center gap-1.5 text-[10px] font-medium text-navy-500"><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</div>
                      <select aria-label={`${item.case_name} sorumlu avukatı`} value={item.assigned_lawyer_id ?? ""} disabled={savingId === item.id} onChange={(event) => assign(item.id, event.target.value)} className={SELECT_CLASS}>
                        {!item.assigned_lawyer_id && <option value="">Atanmamış</option>}
                        {lawyers.filter((row) => row.is_active || row.id === item.assigned_lawyer_id).map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}
                      </select>
                    </article>;
                  })}
                  {ownerCases.length === 0 && <div className="rounded-xl border border-dashed border-surface-border px-3 py-8 text-center text-[11px] text-navy-400">Bu sütunda dava yok</div>}
                </div>
              </div>;
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
