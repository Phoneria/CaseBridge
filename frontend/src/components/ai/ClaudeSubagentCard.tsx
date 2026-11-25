"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  getClaudeSubagent,
  removeClaudeSubagentToken,
  saveClaudeSubagentToken,
  searchClaudeSubagentUsers,
  setClaudeSubagentUsers,
  testClaudeSubagent,
} from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { ClaudeSubagentSettings, ClaudeSubagentUser } from "@/types";

export const PERSONAL_USE_NOTE = "Yalnızca kişisel kullanım; büro kullanıcılarına açılmaz.";
export const SETUP_HELP = "Terminalde `claude setup-token` çalıştırıp çıkan token'ı yapıştırın.";

const BADGES: Record<ClaudeSubagentSettings["status"], { label: string; className: string }> = {
  ok: { label: "Aktif", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  invalid: { label: "Geçersiz", className: "bg-red-50 text-red-700 ring-red-200" },
  error: { label: "Hata", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  unknown: { label: "Test edilmedi", className: "bg-slate-100 text-navy-600 ring-surface-border" },
  none: { label: "Yok", className: "bg-slate-100 text-navy-600 ring-surface-border" },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

/** Platform admin only: the owner's Claude setup-token and the accounts it serves. */
export function ClaudeSubagentCard() {
  const [settings, setSettings] = useState<ClaudeSubagentSettings | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "remove" | "users">(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClaudeSubagentUser[]>([]);

  useEffect(() => {
    getClaudeSubagent().then(setSettings).catch(() => setMessage({ kind: "error", text: "Claude ayarları yüklenemedi." }));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchClaudeSubagentUsers(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function act(kind: "save" | "test" | "remove" | "users", work: () => Promise<void>) {
    setBusy(kind);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setMessage({ kind: "error", text: userMessage(error, "İşlem tamamlanamadı.") });
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void act("save", async () => {
      setSettings(await saveClaudeSubagentToken(token.trim()));
      setToken(""); // the value never stays in the page
      setMessage({ kind: "ok", text: "Token kaydedildi. Bağlantıyı test edin." });
    });
  }

  function test() {
    void act("test", async () => {
      const result = await testClaudeSubagent();
      setMessage({ kind: result.ok ? "ok" : "error", text: result.message });
      setSettings(await getClaudeSubagent());
    });
  }

  function remove() {
    void act("remove", async () => {
      setSettings(await removeClaudeSubagentToken());
      setMessage({ kind: "ok", text: "Token kaldırıldı." });
    });
  }

  function updateUsers(ids: string[]) {
    void act("users", async () => {
      setSettings(await setClaudeSubagentUsers(ids));
      setQuery("");
      setResults([]);
    });
  }

  const status = settings?.status ?? "none";
  const badge = BADGES[status];
  const chosen = settings?.users ?? [];

  return (
    <section aria-labelledby="claude-subagent-title" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="claude-subagent-title" className="text-base font-semibold text-navy-900">Claude (setup token)</h2>
        <span data-testid="claude-subagent-badge" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-amber-800">{PERSONAL_USE_NOTE}</p>
      <p className="mt-1 text-sm text-navy-500">{SETUP_HELP} Token yalnız aşağıda seçtiğiniz hesapların yapay zekâ isteklerinde kullanılır; diğer kullanıcılar ve tanıtım sitesi mevcut bağlantıyı kullanır.</p>
      {status === "invalid" && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Token geçersiz, yenileyin.</p>}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-navy-500">Durum</dt><dd className="font-medium text-navy-900">{settings?.set ? "Kayıtlı" : "Yok"}</dd></div>
        <div><dt className="text-navy-500">Son 4</dt><dd className="font-mono text-navy-900">{settings?.last4 ? `••••${settings.last4}` : "—"}</dd></div>
        <div><dt className="text-navy-500">Güncellendi</dt><dd className="text-navy-900">{formatDate(settings?.updated_at ?? null)}</dd></div>
      </dl>

      <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-navy-700">
          <span className="mb-1 block font-medium">Setup token</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="sk-ant-oat01-…"
            className="w-full rounded-xl border border-surface-border bg-surface-muted px-3 py-2 font-mono text-sm text-navy-900 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={!token.trim() || busy !== null} className="rounded-xl bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">Kaydet</button>
          <button type="button" onClick={test} disabled={!settings?.set || busy !== null} className="rounded-xl border border-surface-border px-3 py-2 text-sm font-semibold text-navy-800 hover:bg-surface-muted disabled:opacity-50">{busy === "test" ? "Test ediliyor…" : "Test et"}</button>
          <button type="button" onClick={remove} disabled={!settings?.set || busy !== null} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Kaldır</button>
        </div>
      </form>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-navy-900">Token'ı kullanacak hesaplar</h3>
        {chosen.length === 0 ? (
          <p className="mt-1 text-sm text-navy-500">Henüz hesap seçilmedi; token hiçbir istekte kullanılmaz.</p>
        ) : (
          <ul aria-label="Seçili hesaplar" className="mt-2 space-y-1">
            {chosen.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-navy-800">{user.full_name} · {user.email} · {user.firm_name}</span>
                <button type="button" disabled={busy !== null} onClick={() => updateUsers(chosen.filter((u) => u.id !== user.id).map((u) => u.id))}
                  aria-label={`${user.email} hesabını çıkar`} className="text-xs font-semibold text-red-700 hover:underline">Çıkar</button>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-3 block text-sm text-navy-700">
          <span className="mb-1 block font-medium">Hesap ekle</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad veya e-posta"
            className="w-full rounded-xl border border-surface-border bg-surface-muted px-3 py-2 text-sm text-navy-900 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200" />
        </label>
        {results.length > 0 && (
          <ul aria-label="Arama sonuçları" className="mt-2 space-y-1">
            {results.filter((user) => !chosen.some((c) => c.id === user.id)).map((user) => (
              <li key={user.id}>
                <button type="button" disabled={busy !== null} onClick={() => updateUsers([...chosen.map((u) => u.id), user.id])}
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-left text-sm text-navy-800 hover:border-accent-300 hover:bg-accent-50">
                  {user.full_name} · {user.email} · {user.firm_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm font-medium ${message.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>
      )}
    </section>
  );
}
