"use client";

import { useRef, useState, type FormEvent } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { addPlatformFirmAdmin, createPlatformFirm } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { PlatformAdminInvite, PlatformFirm, PlatformFirmCreated } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const LABEL = "text-xs font-medium text-navy-600";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FirmSaved =
  | { kind: "firm"; created: PlatformFirmCreated }
  | { kind: "admin"; firmId: string; invite: PlatformAdminInvite };

/** Without `firm`: a new firm and its first admin. With `firm`: one more admin for it. */
export function FirmFormModal({
  firm,
  onClose,
  onSaved,
}: {
  firm?: PlatformFirm;
  onClose: () => void;
  onSaved: (result: FirmSaved) => void;
}) {
  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const name = firmName.trim();
    const person = fullName.trim();
    const address = email.trim();
    if (!firm && !name) return setError("Büro adı boş olamaz.");
    if (!person) return setError("Ad soyad boş olamaz.");
    if (!address) return setError("E-posta adresi gerekli.");
    if (!EMAIL_SHAPE.test(address)) return setError("Geçerli bir e-posta adresi girin.");
    setError(null);

    inFlight.current = true;
    setSaving(true);
    try {
      if (firm) {
        const invite = await addPlatformFirmAdmin(firm.id, { full_name: person, email: address });
        onSaved({ kind: "admin", firmId: firm.id, invite });
      } else {
        const created = await createPlatformFirm({ name, admin_full_name: person, admin_email: address });
        onSaved({ kind: "firm", created });
      }
    } catch (err) {
      setError(userMessage(err, firm ? "Yönetici eklenemedi. Lütfen tekrar deneyin." : "Büro oluşturulamadı. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={firm ? `Yönetici ekle — ${firm.name}` : "Yeni büro"} onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {!firm && (
          <label className="block">
            <span className={LABEL}>Büro adı *</span>
            <input className={INPUT} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className={LABEL}>{firm ? "Ad soyad *" : "Yönetici adı soyadı *"}</span>
          <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>{firm ? "E-posta *" : "Yönetici e-postası *"}</span>
          <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <p className="text-xs text-navy-500">Yönetici, e-postayla gelen bağlantıdan kendi şifresini belirler.</p>
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
            {saving ? "Kaydediliyor..." : firm ? "Ekle" : "Büroyu oluştur"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
