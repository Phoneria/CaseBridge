"use client";

import { useEffect, useState } from "react";

import { getAiStatus, getMe, listUsers } from "@/lib/api";
import type { AIStatus, AppUser } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

const ROLE_LABELS: Record<string, string> = { admin: "Yönetici", lawyer: "Avukat" };

export function SettingsView() {
  const [me, setMe] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getMe(), listUsers(), getAiStatus()])
      .then(([meResult, usersResult, aiStatusResult]) => {
        setMe(meResult);
        setUsers(usersResult);
        setAiStatus(aiStatusResult);
      })
      .catch(() => setError("Ayarlar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1>
        <p className="text-sm text-navy-500">Büro ve kullanıcı ayarlarınızı yönetin.</p>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-navy-700">Yapay Zeka Durumu</p>
        {aiStatus && (
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                aiStatus.configured ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span className="uppercase text-navy-800">{aiStatus.provider}</span>
            <span className="text-navy-500">
              {aiStatus.configured ? "yapılandırıldı" : aiStatus.error ?? "yapılandırılmadı"}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
        {isAdmin ? (
          <ul className="divide-y divide-surface-border text-sm">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-navy-800">{user.full_name}</p>
                  <p className="text-xs text-navy-500">{user.email}</p>
                </div>
                <span className="text-xs text-navy-500">{ROLE_LABELS[user.role] ?? user.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-navy-500">Kullanıcı yönetimi sadece yöneticiler içindir.</p>
        )}
      </div>
    </div>
  );
}
