"use client";

import { useEffect, useRef, useState } from "react";

import { ReasonDialog } from "@/components/management/RecordPanel";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { FirmDetailModal } from "@/components/platform/FirmDetailModal";
import { FirmFormModal, type FirmSaved } from "@/components/platform/FirmFormModal";
import { NoticeLine, type Notice } from "@/components/platform/NoticeLine";
import { activatePlatformFirm, listPlatformFirms, resendPlatformAdminInvite, suspendPlatformFirm } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { PlatformAdmin, PlatformFirm } from "@/types";
import Link from "next/link";


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

// The backend sends naive UTC timestamps (no offset); without a "Z" the
// browser would read them as local time and can show the wrong day.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(HAS_OFFSET.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("tr-TR");
}

/** The CaseBridge team's list of customer firms (/platform). */
export function PlatformView() {
  const [firms, setFirms] = useState<PlatformFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  async function changeStatus(firmId: string, suspend: boolean, reason: string) {
    const next = suspend ? await suspendPlatformFirm(firmId, reason) : await activatePlatformFirm(firmId, reason);
    putFirm(next);
    setDialog({ kind: "detail", firmId });
    setNotice({ tone: "ok", text: suspend ? "Büro askıya alındı." : "Büro aktifleştirildi." });
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const current = dialog && dialog.kind !== "create" ? firms.find((item) => item.id === dialog.firmId) : undefined;
  const confirm = dialog?.kind === "confirm" ? dialog : null;
  const visibleFirms = firms.filter(item =>
    `${item.name} ${item.admins.map(a => `${a.full_name} ${a.email}`).join(" ")}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")) &&
    (!statusFilter || (statusFilter === "active" ? item.is_active : statusFilter === "suspended" ? !item.is_active : item.admins.some(a => a.status === "pending")))
  );

  const counts = [
    { value: "", label: "büro", count: firms.length },
    { value: "active", label: "aktif", count: firms.filter(f => f.is_active).length },
    { value: "suspended", label: "askıda", count: firms.filter(f => !f.is_active).length },
    { value: "pending", label: "davet bekleyen", count: firms.filter(f => f.admins.some(a => a.status === "pending")).length },
  ];
  const fieldClass = "h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600";

  return (
    <section aria-labelledby="platform-firms" className="text-slate-800">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="platform-firms" className="text-2xl font-semibold tracking-tight text-slate-950">Bürolar</h1>
          <div aria-label="Büro özeti" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {counts.map(({value, label, count}, index) => <span key={label} className="inline-flex items-center gap-3">
              {index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}
              <button type="button" onClick={() => setStatusFilter(value)} aria-pressed={statusFilter === value}
                className={`rounded-sm underline-offset-4 hover:text-accent-700 hover:underline ${statusFilter === value ? "text-slate-950 underline decoration-accent-600" : "text-slate-500"}`}>
                <span className="font-medium tabular-nums">{count}</span> {label}
              </button>
            </span>)}
          </div>
        </div>
        <button type="button" onClick={() => { setNotice(null); setDialog({kind:"create"}); }}
          className="rounded-md bg-accent-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700">Yeni büro</button>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-slate-600 sm:max-w-sm">Büro veya yönetici ara
          <input type="search" className={fieldClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad veya e-posta" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">Büro durumu
          <select className={fieldClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tüm bürolar</option><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="pending">Davet bekleyen</option>
          </select>
        </label>
        <p aria-live="polite" className="pb-2.5 text-xs text-slate-500 sm:ml-auto">{visibleFirms.length} büro gösteriliyor</p>
      </div>
      {notice && !dialog && <NoticeLine notice={notice} />}
      {firms.length > 0 && visibleFirms.length === 0 && <p className="border-t border-slate-200 py-10 text-sm text-slate-500">Aramaya uygun büro bulunamadı.</p>}
      {firms.length === 0 ? (
        <p className="border-t border-slate-200 py-10 text-sm text-slate-500">Henüz büro yok. &quot;Yeni büro&quot; ile ilk büroyu açın.</p>
      ) : visibleFirms.length > 0 && (
        <div className="overflow-x-auto pb-32">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-y border-slate-200 text-xs text-slate-500">
                <th scope="col" className="py-3 pr-5 font-medium">Büro</th>
                <th scope="col" className="py-3 pr-5 font-medium">Durum</th>
                <th scope="col" className="py-3 pr-5 text-right font-medium">Aktif kullanıcı</th>
                <th scope="col" className="py-3 pr-5 font-medium">Yöneticiler</th>
                <th scope="col" className="py-3 pr-5 font-medium">Yönetici erişimi</th>
                <th scope="col" className="hidden py-3 pr-5 font-medium xl:table-cell">Oluşturulma</th>
                <th scope="col" className="py-3 text-right font-medium"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleFirms.map(item => {
                const pending = item.admins.filter(a => a.status === "pending").length;
                const active = item.admins.some(a => a.status === "active");
                return <tr key={item.id} className="group hover:bg-slate-100/70">
                  <th scope="row" className="py-4 pr-5 font-medium">
                    <Link href={`/platform/${item.id}`} className="text-slate-950 underline-offset-4 hover:text-accent-700 hover:underline">{item.name}</Link>
                  </th>
                  <td className="py-4 pr-5"><span className={`inline-flex items-center gap-2 text-xs ${item.is_active ? "text-slate-600" : "font-medium text-red-700"}`}>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.is_active ? "bg-emerald-600" : "bg-red-600"}`} />{item.is_active ? "Aktif" : "Askıda"}
                  </span></td>
                  <td className="py-4 pr-5 text-right tabular-nums text-slate-600">{item.active_user_count}</td>
                  <td className="py-4 pr-5 text-slate-600">{item.admins.map(a => a.full_name).join(", ") || "—"}</td>
                  <td className="py-4 pr-5 text-xs">{pending > 0 ? <span className="font-medium text-amber-800">Davet bekliyor{pending > 1 ? ` (${pending})` : ""}</span> : <span className={active ? "text-slate-500" : "text-red-700"}>{active ? "Hesap açıldı" : "Aktif yönetici yok"}</span>}</td>
                  <td className="hidden py-4 pr-5 text-xs tabular-nums text-slate-500 xl:table-cell">{formatDate(item.created_at)}</td>
                  <td className="py-3 text-right">
                    <details className="relative inline-block text-left" onKeyDown={e => {if(e.key === "Escape") {e.currentTarget.open=false;e.currentTarget.querySelector("summary")?.focus();}}} onBlur={e => {if(!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open=false;}}>
                      <summary aria-label={`${item.name} işlemleri`} className="cursor-pointer list-none rounded-md px-3 py-2 font-semibold text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-600 [&::-webkit-details-marker]:hidden">···</summary>
                      <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg" onClick={e => { const d=e.currentTarget.closest("details");if(d)d.open=false; }}>
                        <Link href={`/platform/${item.id}`} className="block px-3 py-2 hover:bg-slate-100">Büro profili</Link>
                        <button type="button" onClick={() => openDetail(item.id)} className="block w-full px-3 py-2 text-left hover:bg-slate-100">Yöneticiler ve davetler</button>
                        <button type="button" onClick={() => {setNotice(null);setDialog({kind:"confirm",firmId:item.id,suspend:item.is_active});}} className="block w-full px-3 py-2 text-left hover:bg-slate-100">{item.is_active ? "Büroyu askıya al" : "Büroyu aktifleştir"}</button>
                      </div>
                    </details>
                  </td>
                </tr>;
              })}
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
        <ReasonDialog
          title={confirm.suspend ? "Büroyu askıya al" : "Büroyu aktifleştir"}
          description={
            confirm.suspend
              ? `${current.name} bürosunun hiçbir kullanıcısı giriş yapamayacak ve açık oturumlar kapanacak. Veriler silinmez; büroyu daha sonra yeniden aktifleştirebilirsiniz.`
              : `${current.name} bürosunun kullanıcıları yeniden giriş yapabilecek.`
          }
          confirmLabel={confirm.suspend ? "Askıya al" : "Aktifleştir"}
          onConfirm={(reason) => changeStatus(current.id, confirm.suspend, reason)}
          onClose={() => setDialog({ kind: "detail", firmId: current.id })}
        />
      )}
    </section>
  );
}
