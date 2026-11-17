"use client";

import { useRef, useState } from "react";

import { INPUT_CLASS } from "@/components/case-form/Field";
import { ModalFrame } from "@/components/ModalFrame";
import { createClient, updateClient } from "@/lib/api";
import { CLIENT_TYPE_LABELS, isValidEmail } from "@/lib/clients";
import { userMessage } from "@/lib/userMessages";
import type { Client, ClientPayload, ClientType } from "@/types";

interface Props {
  title: string;
  /** The client being edited; a new client when missing. */
  initial?: Client | null;
  onSaved: (client: Client) => void;
  onClose: () => void;
}

const LABEL = "mb-1 block text-xs font-medium text-navy-600";

/** Create or edit a client: name, type and contact details. */
export function ClientFormModal({ title, initial, onSaved, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [clientType, setClientType] = useState<ClientType>(initial?.client_type ?? "person");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    const nextErrors = {
      name: name.trim() ? undefined : "Ad gerekli.",
      email: email.trim() && !isValidEmail(email) ? "Geçerli bir e-posta girin." : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email) return;
    const blank = (value: string) => value.trim() || null;
    const payload: ClientPayload = {
      name: name.trim(),
      client_type: clientType,
      phone: blank(phone),
      email: blank(email),
      address: blank(address),
      notes: blank(notes),
    };
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      onSaved(initial ? await updateClient(initial.id, payload) : await createClient(payload));
    } catch (err) {
      setError(userMessage(err, "Müvekkil kaydedilemedi."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={title} onClose={onClose} busy={saving}>
      <div className="space-y-3">
        <div>
          <label htmlFor="client-name" className={LABEL}>
            Ad / unvan <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input id="client-name" data-autofocus className={INPUT_CLASS} maxLength={255} value={name}
            aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "client-name-hata" : undefined}
            onChange={(e) => setName(e.target.value)} />
          {errors.name && <p id="client-name-hata" className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="client-type" className={LABEL}>Tür</label>
          <select id="client-type" className={INPUT_CLASS} value={clientType} onChange={(e) => setClientType(e.target.value as ClientType)}>
            {(Object.keys(CLIENT_TYPE_LABELS) as ClientType[]).map((type) => (
              <option key={type} value={type}>{CLIENT_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="client-phone" className={LABEL}>Telefon</label>
            <input id="client-phone" type="tel" className={INPUT_CLASS} maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label htmlFor="client-email" className={LABEL}>E-posta</label>
            <input id="client-email" type="email" className={INPUT_CLASS} maxLength={255} value={email}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "client-email-hata" : undefined}
              onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p id="client-email-hata" className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="client-address" className={LABEL}>Adres</label>
          <textarea id="client-address" rows={2} className={INPUT_CLASS} maxLength={4000} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label htmlFor="client-notes" className={LABEL}>Not</label>
          <textarea id="client-notes" rows={3} className={INPUT_CLASS} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
            Vazgeç
          </button>
          <button type="button" aria-disabled={saving} onClick={save}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-50">
            Kaydet
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
