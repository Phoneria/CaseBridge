"use client";

import { useEffect, useRef, useState } from "react";

import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { FirmDetailModal } from "@/components/platform/FirmDetailModal";
import { FirmFormModal, type FirmSaved } from "@/components/platform/FirmFormModal";
import { NoticeLine, type Notice } from "@/components/platform/NoticeLine";
import { activatePlatformFirm, listPlatformFirms, resendPlatformAdminInvite, suspendPlatformFirm } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { PlatformAdmin, PlatformFirm } from "@/types";

const INVITE_FAILED = "Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.";
const SUSPENDED_ADD =
  "Yönetici eklendi. Büro askıda olduğu için davet e-postası gönderilmedi; büroyu aktifleştirdikten sonra daveti gönderin.";

type Dialog =
  | { kind: "create" }
  | { kind: "detail"; firmId: string }
  | { kind: "add-admin"; firmId: string }
  | { kind: "confirm"; firmId: string; suspend: boolean };

function byName(a: PlatformFirm, b: PlatformFirm) {
  return a.name.localeCompare(b.name, "tr");
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("tr-TR") : "—";
}

/** The CaseBridge team's list of customer firms (/platform). */
export function PlatformView() {
  const [firms, setFirms] = useState<PlatformFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    listPlatformFirms()
      .then((result) => active && setFirms([...result].sort(byName)))
      .catch((err) => active && setLoadError(userMessage(err, "Bürolar yüklenemedi. Lütfen daha sonra tekrar deneyin.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function putFirm(next: PlatformFirm) {
    setFirms((prev) => [...prev.filter((item) => item.id !== next.id), next].sort(byName));
  }

  function putAdmin(firmId: string, admin: PlatformAdmin) {
    setFirms((prev) =>
      prev.map((item) => {
        if (item.id !== firmId) return item;
        const known = item.admins.some((a) => a.id === admin.id);
        return { ...item, admins: known ? item.admins.map((a) => (a.id === admin.id ? admin : a)) : [...item.admins, admin] };
      }),
    );
  }

  function openDetail(firmId: string) {
    setNotice(null);
    setDialog({ kind: "detail", firmId });
  }

  function saved(result: FirmSaved) {
    if (result.kind === "firm") {
      putFirm(result.created.firm);
      setDialog(null);
      setNotice(result.created.email_sent ? { tone: "ok", text: "Büro oluşturuldu, davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
      return;
    }
    const target = firms.find((item) => item.id === result.firmId);
    putAdmin(result.firmId, result.invite.admin);
    setDialog({ kind: "detail", firmId: result.firmId });
    setNotice(
      result.invite.email_sent
        ? { tone: "ok", text: "Yönetici eklendi, davet gönderildi." }
        : { tone: "warn", text: target && !target.is_active ? SUSPENDED_ADD : INVITE_FAILED },
    );
  }

  async function resend(firmId: string, admin: PlatformAdmin) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await resendPlatformAdminInvite(firmId, admin.id);
      putAdmin(firmId, result.admin);
      setNotice(result.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
    } catch (err) {
      setNotice({ tone: "error", text: userMessage(err, "Davet gönderilemedi. Lütfen tekrar deneyin.") });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(firmId: string, suspend: boolean) {
    const next = suspend ? await suspendPlatformFirm(firmId) : await activatePlatformFirm(firmId);
    putFirm(next);
    setDialog({ kind: "detail", firmId });
    setNotice({ tone: "ok", text: suspend ? "Büro askıya alındı." : "Büro aktifleştirildi." });
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const current = dialog && dialog.kind !== "create" ? firms.find((item) => item.id === dialog.firmId) : undefined;
  const confirm = dialog?.kind === "confirm" ? dialog : null;

  return (
    <section aria-labelledby="platform-firms" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h1 id="platform-firms" className="text-base font-semibold text-navy-900">
          Bürolar
        </h1>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setDialog({ kind: "create" });
          }}
          className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white"
        >
          Yeni büro
        </button>
      </div>

      {notice && !dialog && <NoticeLine notice={notice} />}

      {firms.length === 0 ? (
        <p className="text-sm text-navy-500">Henüz büro yok. &quot;Yeni büro&quot; ile ilk büroyu açın.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs text-navy-500">
                <th className="py-2 pr-3 font-medium">Büro</th>
                <th className="py-2 pr-3 font-medium">Durum</th>
                <th className="py-2 pr-3 font-medium">Aktif kullanıcı</th>
                <th className="py-2 pr-3 font-medium">Yöneticiler</th>
                <th className="py-2 font-medium">Oluşturulma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {firms.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">
                    <button type="button" onClick={() => openDetail(item.id)} className="font-medium text-navy-800 hover:underline">
                      {item.name}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                    >
                      {item.is_active ? "Aktif" : "Askıda"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-navy-600">{item.active_user_count}</td>
                  <td className="py-2 pr-3 text-navy-600">
                    {item.admins.map((admin) => (
                      <span key={admin.id} className="mr-3 inline-flex items-center gap-1">
                        {admin.full_name}
                        {admin.status === "pending" && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Davet bekliyor</span>
                        )}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 text-navy-600">{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" && <FirmFormModal onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "add-admin" && current && (
        <FirmFormModal firm={current} onClose={() => setDialog({ kind: "detail", firmId: current.id })} onSaved={saved} />
      )}
      {dialog?.kind === "detail" && current && (
        <FirmDetailModal
          firm={current}
          notice={notice}
          busy={busy}
          onClose={() => {
            setNotice(null);
            setDialog(null);
          }}
          onResend={(admin) => void resend(current.id, admin)}
          onAddAdmin={() => {
            setNotice(null);
            setDialog({ kind: "add-admin", firmId: current.id });
          }}
          onToggle={() => {
            setNotice(null);
            setDialog({ kind: "confirm", firmId: current.id, suspend: current.is_active });
          }}
        />
      )}
      {confirm && current && (
        <CaseConfirmModal
          title={confirm.suspend ? "Büroyu askıya al" : "Büroyu aktifleştir"}
          message={
            confirm.suspend
              ? `${current.name} bürosunun hiçbir kullanıcısı giriş yapamayacak ve açık oturumlar kapanacak. Veriler silinmez; büroyu daha sonra yeniden aktifleştirebilirsiniz.`
              : `${current.name} bürosunun kullanıcıları yeniden giriş yapabilecek.`
          }
          confirmLabel={confirm.suspend ? "Askıya al" : "Aktifleştir"}
          fallbackError="İşlem tamamlanamadı. Lütfen tekrar deneyin."
          onConfirm={() => changeStatus(current.id, confirm.suspend)}
          onClose={() => setDialog({ kind: "detail", firmId: current.id })}
        />
      )}
    </section>
  );
}
