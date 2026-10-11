"use client";

import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { DeactivateUserModal } from "@/components/users/DeactivateUserModal";
import { UserFormModal, type UserSaved } from "@/components/users/UserFormModal";
import { activateUser, listManagedUsers, resendUserInvite, sendUserPasswordReset } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, DeactivateResult, ManagedUser, UserStatus } from "@/types";

const ROLE_LABELS = { admin: "Yönetici", lawyer: "Avukat" } as const;
const STATUS_LABELS: Record<UserStatus, string> = { active: "Aktif", pending: "Davet bekliyor", inactive: "Pasif" };
const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  inactive: "bg-surface-muted text-navy-500",
};
const INVITE_FAILED = "Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.";

type Notice = { tone: "ok" | "warn" | "error"; text: string };
type Dialog = { kind: "create" } | { kind: "edit"; user: ManagedUser } | { kind: "deactivate"; user: ManagedUser };

function replaceUser(list: ManagedUser[], next: ManagedUser): ManagedUser[] {
  return list.map((item) => (item.id === next.id ? next : item));
}

function RowMenu({ user, isSelf, onPick }: { user: ManagedUser; isSelf: boolean; onPick: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items: { id: string; label: string }[] = [{ id: "edit", label: "Düzenle" }];
  if (user.status === "pending") items.push({ id: "invite", label: "Daveti yeniden gönder" });
  if (user.status === "active") items.push({ id: "reset", label: "Şifre sıfırlama bağlantısı gönder" });
  if (user.status !== "inactive" && !isSelf) items.push({ id: "deactivate", label: "Pasifleştir" });
  if (user.status === "inactive") items.push({ id: "activate", label: "Aktifleştir" });

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`İşlemler, ${user.full_name}`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-surface-border px-3 py-1 text-xs font-medium text-navy-700 hover:bg-surface-muted"
      >
        İşlemler
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(item.id);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UsersPanel({ currentUser }: { currentUser: AppUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    listManagedUsers()
      .then((result) => active && setUsers(result))
      .catch((err) => active && setLoadError(userMessage(err, "Kullanıcılar yüklenemedi. Lütfen daha sonra tekrar deneyin.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function saved(result: UserSaved) {
    setDialog(null);
    if (result.kind === "created") {
      setUsers((prev) => [...prev, result.user]);
      setNotice(result.user.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
    } else {
      setUsers((prev) => replaceUser(prev, result.user));
      setNotice({ tone: "ok", text: "Kullanıcı güncellendi." });
    }
  }

  function deactivated(result: DeactivateResult) {
    setDialog(null);
    setUsers((prev) => replaceUser(prev, result.user));
    setNotice({ tone: "ok", text: "Kullanıcı pasifleştirildi." });
  }

  async function runAction(user: ManagedUser, action: string) {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    try {
      if (action === "invite") {
        const result = await resendUserInvite(user.id);
        setUsers((prev) => replaceUser(prev, result));
        setNotice(result.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
      } else if (action === "reset") {
        const result = await sendUserPasswordReset(user.id);
        setNotice(
          result.email_sent
            ? { tone: "ok", text: "Sıfırlama bağlantısı gönderildi." }
            : { tone: "warn", text: "Sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin." },
        );
      } else if (action === "activate") {
        const result = await activateUser(user.id);
        setUsers((prev) => replaceUser(prev, result));
        setNotice({ tone: "ok", text: "Kullanıcı aktifleştirildi." });
      }
    } catch (err) {
      setNotice({ tone: "error", text: userMessage(err, "İşlem tamamlanamadı. Lütfen tekrar deneyin.") });
    } finally {
      busy.current = false;
    }
  }

  function pick(user: ManagedUser, action: string) {
    if (action === "edit") setDialog({ kind: "edit", user });
    else if (action === "deactivate") setDialog({ kind: "deactivate", user });
    else void runAction(user, action);
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <section aria-labelledby="settings-users" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="settings-users" className="text-sm font-medium text-navy-700">
          Kullanıcılar
        </h2>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white"
        >
          Kullanıcı ekle
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === "ok" ? "status" : "alert"}
          className={`mb-3 text-sm ${notice.tone === "ok" ? "text-emerald-700" : notice.tone === "warn" ? "text-amber-700" : "text-red-700"}`}
        >
          {notice.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs text-navy-500">
              <th className="py-2 pr-3 font-medium">Ad</th>
              <th className="py-2 pr-3 font-medium">E-posta</th>
              <th className="py-2 pr-3 font-medium">Departman</th>
              <th className="py-2 pr-3 font-medium">Rol</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 font-medium">
                <span className="sr-only">İşlemler</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-2 pr-3 font-medium text-navy-800">{user.full_name}</td>
                <td className="py-2 pr-3 text-navy-600">{user.email}</td>
                <td className="py-2 pr-3 text-navy-600">{user.department ?? "—"}</td>
                <td className="py-2 pr-3 text-navy-600">{ROLE_LABELS[user.role]}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[user.status]}`}>{STATUS_LABELS[user.status]}</span>
                </td>
                <td className="py-2 text-right">
                  <RowMenu user={user} isSelf={user.id === currentUser.id} onPick={(action) => pick(user, action)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "create" && <UserFormModal onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "edit" && (
        <UserFormModal user={dialog.user} isSelf={dialog.user.id === currentUser.id} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "deactivate" && (
        <DeactivateUserModal user={dialog.user} candidates={users} onClose={() => setDialog(null)} onDone={deactivated} />
      )}
    </section>
  );
}
