"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { ClientFormModal } from "@/components/ClientFormModal";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { StatCard } from "@/components/StatCard";
import { deleteClient, getClient, getMe } from "@/lib/api";
import { CLIENT_TYPE_LABELS, formatTry } from "@/lib/clients";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { ClientDetail } from "@/types";

const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";
const BUTTON = "rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted";

export function ClientDetailView({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    getClient(clientId)
      .then((value) => active && setDetail(value))
      .catch((err) => active && setError(userMessage(err, "Müvekkil yüklenemedi.")));
    getMe().then((user) => active && setIsAdmin(user.role === "admin")).catch(() => {});
    return () => {
      active = false;
    };
  }, [clientId]);

  if (error) return <ErrorState message={error} />;
  if (!detail) return <LoadingState />;

  const { stats } = detail;
  const hasCases = stats.total > 0;
  const contact: [string, ReactNode][] = [
    ["Telefon", detail.phone ? <a href={`tel:${detail.phone}`} className="text-accent-700 hover:underline">{detail.phone}</a> : "—"],
    ["E-posta", detail.email ? <a href={`mailto:${detail.email}`} className="text-accent-700 hover:underline">{detail.email}</a> : "—"],
    ["Adres", detail.address ?? "—"],
    ["Not", detail.notes ?? "—"],
  ];

  return (
    <div className="space-y-5">
      <Link href="/muvekkiller" className="text-sm text-navy-500 hover:text-accent-700">← Müvekkillere dön</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy-900">{detail.name}</h1>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-navy-600">{CLIENT_TYPE_LABELS[detail.client_type]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/davalar/yeni?muvekkil=${detail.id}`}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
            Bu müvekkil için yeni dava
          </Link>
          <button type="button" className={BUTTON} onClick={() => setEditing(true)}>Düzenle</button>
          {isAdmin && (
            <button type="button" aria-disabled={hasCases} aria-describedby={hasCases ? "client-delete-hint" : undefined}
              onClick={() => !hasCases && setDeleting(true)}
              className={`${BUTTON} text-red-600 hover:border-red-300 aria-disabled:opacity-40`}>
              Sil
            </button>
          )}
        </div>
      </header>
      {isAdmin && hasCases && <p id="client-delete-hint" className="text-xs text-navy-500">Davası olan müvekkil silinemez.</p>}

      <section className={CARD} aria-labelledby="client-contact">
        <h2 id="client-contact" className="mb-3 text-sm font-semibold text-navy-800">İletişim</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {contact.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-navy-500">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-navy-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Özet" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Toplam dava" value={stats.total} />
        <StatCard label="Açık dava" value={stats.open} accent />
        <StatCard label="Kazanılan" value={stats.won} />
        <StatCard label="Kaybedilen" value={stats.lost} />
        <StatCard label="Sulh" value={stats.settled} />
        <StatCard label="Toplam dava değeri" value={formatTry(stats.total_case_value)} />
      </section>

      <section className={CARD} aria-labelledby="client-cases">
        <h2 id="client-cases" className="mb-3 text-sm font-semibold text-navy-800">Davalar</h2>
        {detail.cases.length === 0 ? (
          <EmptyState message="Bu müvekkilin henüz davası yok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-navy-500">
                <tr>
                  <th className="py-2 pr-4">Dava no</th>
                  <th className="py-2 pr-4">Ad</th>
                  <th className="py-2 pr-4">Tür</th>
                  <th className="py-2 pr-4">Durum</th>
                  <th className="py-2 pr-4">Sorumlu avukat</th>
                  <th className="py-2">Sonraki duruşma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {detail.cases.map((item) => (
                  <tr key={item.id} className={`cursor-pointer hover:bg-surface-muted ${item.is_archived ? "opacity-60" : ""}`}
                    onClick={() => router.push(`/davalar/${item.id}`)}>
                    <td className="py-2 pr-4 text-navy-600">{item.case_number}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/davalar/${item.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-800 hover:text-accent-700">
                        {item.case_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-navy-600">{CASE_TYPE_LABELS[item.case_type]}</td>
                    <td className="py-2 pr-4 text-navy-600">{CASE_STATUS_LABELS[item.status]}{item.is_archived ? " · Arşivde" : ""}</td>
                    <td className="py-2 pr-4 text-navy-600">{item.assigned_lawyer_name ?? "—"}</td>
                    <td className="py-2 text-navy-600">{item.next_hearing_date ? formatDate(item.next_hearing_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <ClientFormModal title="Müvekkili düzenle" initial={detail} onClose={() => setEditing(false)}
          onSaved={(client) => {
            setDetail((current) => (current ? { ...current, ...client } : current));
            setEditing(false);
          }} />
      )}
      {deleting && (
        <CaseConfirmModal title="Müvekkili sil" message={`${detail.name} kalıcı olarak silinecek.`} confirmLabel="Sil"
          fallbackError="Müvekkil silinemedi." onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteClient(detail.id);
            router.push("/muvekkiller");
          }} />
      )}
    </div>
  );
}
