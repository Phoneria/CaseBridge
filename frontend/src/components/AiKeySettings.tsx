"use client";

import { useEffect, useRef, useState } from "react";
import { activateAiKey, getAiKeyStatus, saveAiKey, type AIKeyStatus } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { AIConnectivity } from "@/types";
import { ModalFrame } from "@/components/ModalFrame";

export function AiKeySettings({ onSaved }: { onSaved: (result: AIConnectivity) => void }) {
  const [status, setStatus] = useState<AIKeyStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getAiKeyStatus().then((value) => { if (!cancelled) setStatus(value); })
      .catch(() => { if (!cancelled) setError("Anahtar yönetimi yüklenemedi. Sayfayı yenileyerek tekrar deneyin."); });
    return () => { cancelled = true; };
  }, []);

  function close() { if (!busy.current) { setKey(""); setError(null); setOpen(false); } }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !key.trim()) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    const candidate = key.trim();
    setKey("");
    try {
      const result = await saveAiKey(candidate);
      setStatus(result);
      setOpen(false);
      setNotice("Yeni anahtar test edildi ve beklemeye alındı. Mevcut bağlantı değişmedi.");
    } catch (err) {
      setError(userMessage(err, "Anahtar kaydedilemedi. Mevcut anahtarınız korunuyor; yeniden deneyin."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function activate() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await activateAiKey();
      onSaved(result);
      setStatus({ configured: true, managed: true, pending: false, can_save: true });
      setNotice(result.connected ? "Yeni anahtar etkinleştirildi. AI bağlantısı doğrulandı. Önceki anahtar korundu." : "Yeni anahtar etkinleştirildi. Güncel bağlantı durumunu kontrol edin. Önceki anahtar korundu.");
    } catch (err) {
      setError(userMessage(err, "Anahtar etkinleştirilemedi. Mevcut bağlantı korunuyor."));
    } finally { busy.current = false; setSaving(false); }
  }

  return (
    <div className="mt-5 border-t border-surface-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">OpenAI API anahtarı</h3>
          <p className="mt-1 text-sm text-navy-600">Anahtar sunucuda şifrelenir ve tekrar gösterilmez.</p>
        </div>
        <button type="button" disabled={!status?.can_save || saving} onClick={() => { setOpen(true); setError(null); setNotice(null); }}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">Gizli anahtar ekle</button>
      </div>
      {status && !status.can_save && <p className="mt-3 text-sm text-navy-600">Anahtar yönetiminin sunucuda etkinleştirilmesi gerekiyor.</p>}
      {status?.configured && <p className="mt-3 text-xs text-navy-500">Bir anahtar tanımlı. Yeni anahtarı kaydetmek mevcut bağlantıyı değiştirmez.</p>}
      {status?.pending && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4">
        <p className="text-sm text-navy-700">Test edilmiş bir anahtar etkinleştirmeyi bekliyor.</p>
        <button type="button" disabled={saving || !status.can_save} onClick={() => void activate()} className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Etkinleştiriliyor…" : "Yeni anahtarı etkinleştir"}</button>
      </div>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {!open && error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {open && <ModalFrame title="AI bağlantısını kur" onClose={close} busy={saving}>
        <form onSubmit={save}>
          <label htmlFor="openai-secret-key" className="block text-sm font-medium text-navy-700">OpenAI API anahtarı</label>
          <input id="openai-secret-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={key}
            onChange={(event) => setKey(event.target.value)} disabled={saving} maxLength={512} required data-autofocus
            className="mt-2 w-full rounded-xl border border-surface-border px-3 py-2.5 text-sm outline-none focus:border-accent-500" />
          <p className="mt-3 text-sm leading-6 text-navy-600">Kaydetmeden önce kısa bir AI yanıt testi yapılır. Mevcut bağlantı, ayrıca etkinleştirene kadar değişmez.</p>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={close} disabled={saving} className="rounded-xl border border-surface-border px-4 py-2 text-sm text-navy-700 disabled:opacity-50">Vazgeç</button>
            <button type="submit" disabled={saving || !key.trim()} className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">
              {saving ? "Bağlantı kontrol ediliyor…" : "Kaydet ve bağlantıyı kontrol et"}
            </button>
          </div>
        </form>
      </ModalFrame>}
    </div>
  );
}
