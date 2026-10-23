"use client";

import { useRef, useState, type FormEvent } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { createManagedUser, updateManagedUser } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { ManagedUser, ManagedUserInvite, ManagedUserUpdate, UserRole } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL = "text-xs font-medium text-navy-600";

export type UserSaved = { kind: "created"; user: ManagedUserInvite } | { kind: "updated"; user: ManagedUser };

/** Create (no `user`) or edit one firm user. On the admin's own row the role is shown, not editable. */
export function UserFormModal({
  user,
  isSelf = false,
  onClose,
  onSaved,
}: {
  user?: ManagedUser;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (result: UserSaved) => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [department, setDepartment] = useState(user?.department ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "lawyer");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const name = fullName.trim();
    const address = email.trim();
    if (!name) return setError("Ad soyad boş olamaz.");
    if (!address) return setError("E-posta adresi gerekli.");
    if (!EMAIL_SHAPE.test(address)) return setError("Geçerli bir e-posta adresi girin.");
    setError(null);

    inFlight.current = true;
    setSaving(true);
    try {
      if (!user) {
        const created = await createManagedUser({ full_name: name, email: address, department: department.trim() || null, role });
        onSaved({ kind: "created", user: created });
        return;
      }
      const changes: ManagedUserUpdate = {};
      if (name !== user.full_name) changes.full_name = name;
      if (address !== user.email) changes.email = address;
      if ((department.trim() || null) !== user.department) changes.department = department.trim() || null;
      if (!isSelf && role !== user.role) changes.role = role;
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      onSaved({ kind: "updated", user: await updateManagedUser(user.id, changes) });
    } catch (err) {
      setError(userMessage(err, "Kullanıcı kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={user ? "Kullanıcıyı düzenle" : "Kullanıcı ekle"} onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <label className="block">
          <span className={LABEL}>Ad soyad *</span>
          <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>E-posta *</span>
          <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>Departman</span>
          <input className={INPUT} value={department} onChange={(e) => setDepartment(e.target.value)} />
        </label>
        {isSelf ? (
          <p className="text-sm text-navy-600">Rol: {user?.role === "admin" ? "Yönetici" : "Avukat"}</p>
        ) : (
          <label className="block">
            <span className={LABEL}>Rol *</span>
            <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="lawyer">Avukat</option>
              <option value="admin">Yönetici</option>
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            aria-disabled={saving}
            className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            aria-disabled={saving}
            className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white aria-disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
