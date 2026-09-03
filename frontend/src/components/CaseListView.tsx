"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createCase, getCases } from "@/lib/api";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { Case, CaseType } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

const CASE_TYPE_OPTIONS: CaseType[] = ["is_hukuku", "ticaret_hukuku", "sozlesme", "kira", "icra", "diger"];

const EMPTY_FORM = {
  case_number: "",
  case_name: "",
  client_name: "",
  opposing_party: "",
  case_type: "diger" as CaseType,
  court: "",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  devam_eden: "bg-accent-50 text-accent-700",
  durusma_bekleyen: "bg-amber-50 text-amber-700",
  karar_bekleyen: "bg-blue-50 text-blue-700",
  kapali: "bg-surface-muted text-navy-500",
};

export function CaseListView() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load(searchValue?: string) {
    setLoading(true);
    setError(null);
    getCases(searchValue ? { search: searchValue } : {})
      .then(setCases)
      .catch(() => setError("Davalar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    load(search);
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createCase(form);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      load();
    } catch {
      setCreateError("Dava oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Davalar</h1>
          <p className="text-sm text-navy-500">Tüm aktif ve geçmiş davalarınızı yönetin.</p>
        </div>
        <button
          onClick={() => setFormOpen((open) => !open)}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          + Yeni Dava
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Dava adı, müvekkil veya karşı taraf ara..."
          className="w-full max-w-md rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
        />
        <button
          type="submit"
          className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
        >
          Ara
        </button>
      </form>

      {formOpen && (
        <form
          onSubmit={handleCreateSubmit}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-surface-border bg-white p-5 shadow-card sm:grid-cols-2"
        >
          <div>
            <label htmlFor="case_number" className="mb-1 block text-xs font-medium text-navy-600">
              Dava No
            </label>
            <input
              id="case_number"
              required
              value={form.case_number}
              onChange={(event) => setForm({ ...form, case_number: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="case_name" className="mb-1 block text-xs font-medium text-navy-600">
              Dava Adı
            </label>
            <input
              id="case_name"
              required
              value={form.case_name}
              onChange={(event) => setForm({ ...form, case_name: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="client_name" className="mb-1 block text-xs font-medium text-navy-600">
              Müvekkil
            </label>
            <input
              id="client_name"
              required
              value={form.client_name}
              onChange={(event) => setForm({ ...form, client_name: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="opposing_party" className="mb-1 block text-xs font-medium text-navy-600">
              Karşı Taraf
            </label>
            <input
              id="opposing_party"
              value={form.opposing_party}
              onChange={(event) => setForm({ ...form, opposing_party: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="case_type" className="mb-1 block text-xs font-medium text-navy-600">
              Kategori
            </label>
            <select
              id="case_type"
              value={form.case_type}
              onChange={(event) => setForm({ ...form, case_type: event.target.value as CaseType })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            >
              {CASE_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {CASE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="court" className="mb-1 block text-xs font-medium text-navy-600">
              Mahkeme
            </label>
            <input
              id="court"
              value={form.court}
              onChange={(event) => setForm({ ...form, court: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>

          {createError && (
            <div className="sm:col-span-2">
              <ErrorState message={createError} />
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {creating ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      )}

      {loading && <LoadingState label="Davalar yükleniyor..." />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && cases.length === 0 && (
        <EmptyState message="Henüz dava bulunmuyor." hint="Yeni bir dava oluşturarak başlayın." />
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs text-navy-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dava No</th>
                <th className="px-4 py-3 font-medium">Dava Adı</th>
                <th className="px-4 py-3 font-medium">Müvekkil</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-t border-surface-border hover:bg-surface-muted">
                  <td className="px-4 py-3 text-navy-500">{c.case_number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/davalar/${c.id}`} className="font-medium text-navy-900 hover:text-accent-600">
                      {c.case_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{c.client_name}</td>
                  <td className="px-4 py-3 text-navy-700">{CASE_TYPE_LABELS[c.case_type] ?? c.case_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_BADGE_STYLES[c.status] ?? "bg-surface-muted text-navy-600"
                      }`}
                    >
                      {CASE_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
