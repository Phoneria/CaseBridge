"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { getMe, getNotificationStatus, importDemoTemplate, previewDemoRemoval, removeDemoTemplate, type DemoRemovalPreview, sendTestEmail } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, NotificationStatus } from "@/types";
import { AiConnectionPanel } from "@/components/AiConnectionPanel";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { ModalFrame } from "@/components/ModalFrame";
import { UsersPanel } from "@/components/users/UsersPanel";

const EMAIL_BACKEND_LABELS: Record<NotificationStatus["email_backend"], string> = {
  smtp: "SMTP",
  console: "Konsol (yalnızca sunucu logu)",
  file: "Dosya (.eml, yalnızca geliştirme)",
};

type TestEmailState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export function SettingsView() {
  const [me, setMe] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<NotificationStatus | null>(null);
  const [testEmail, setTestEmail] = useState<TestEmailState>({ kind: "idle" });
  const [demoCoverage, setDemoCoverage] = useState<Record<string, number> | null>(null);
  const [demoTemplate, setDemoTemplate] = useState<TestEmailState>({ kind: "idle" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sendingTest = useRef(false);
  const importingDemo = useRef(false);
  const removalTrigger = useRef<HTMLButtonElement>(null);
  const returnRemovalFocus = useRef(false);
  const [removalPreview, setRemovalPreview] = useState<DemoRemovalPreview | null>(null);
  const [removing, setRemoving] = useState(false);
  const [usersRevision, setUsersRevision] = useState(0);

  useEffect(() => {
    if (returnRemovalFocus.current && !removalPreview && !removing) {
      returnRemovalFocus.current = false;
      removalTrigger.current?.focus();
    }
  }, [removalPreview, removing]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getMe(), getNotificationStatus()])
      .then(([meResult, notificationResult]) => {
        setMe(meResult);
        setNotifications(notificationResult);
      })
      .catch(() => setError("Ayarlar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function sendTest() {
    if (sendingTest.current) return;
    sendingTest.current = true;
    // Read before the await: the address the server sends to is this user's.
    const recipient = me?.email ?? "hesabınıza";
    setTestEmail({ kind: "sending" });
    try {
      const result = await sendTestEmail();
      setTestEmail({
        kind: "done",
        message:
          result.backend === "console"
            ? "Test e-postası sunucu loguna yazıldı (konsol modu)."
            : result.backend === "file"
              ? "Test e-postası dosyaya yazıldı (dosya modu)."
              : `Test e-postası ${recipient} adresine gönderildi.`,
      });
    } catch (err) {
      setTestEmail({ kind: "error", message: userMessage(err, "Test e-postası gönderilemedi. Lütfen tekrar deneyin.") });
    } finally {
      sendingTest.current = false;
    }
  }

  async function addExamples(pack: "bureau" | "dossiers") {
    if (importingDemo.current) return;
    importingDemo.current = true;
    setDemoTemplate({ kind: "sending" });
    try {
      const result = await importDemoTemplate(pack);
      setDemoCoverage(result.coverage ?? null);
      setDemoTemplate({ kind: "done", message: pack === "dossiers" ? `20 dava dosyası hazır. ${result.coverage?.["PDF evrak"] ?? 0} evrakı Davalar bölümünde inceleyebilirsiniz.` : result.added_records !== undefined
        ? result.added_records > 0 ? `${result.added_records} kayıt eklendi; gösterim verileri hazır.` : "Gösterim verileri kontrol edildi; eksik kayıt yok, tarihler güncellendi."
        : result.added_cases
        ? `${result.added_cases} dava ve ilişkili veriler büronuza eklendi.`
        : "Gösterim verileri zaten mevcut; yeni kayıt eklenmedi." });
    } catch (err) {
      setDemoTemplate({ kind: "error", message: userMessage(err, "Gösterim verileri eklenemedi. Lütfen tekrar deneyin.") });
    } finally {
      importingDemo.current = false;
    }
  }


  async function previewRemoval() {
    if (importingDemo.current) return;
    importingDemo.current = true; returnRemovalFocus.current = true; setRemoving(true); setDemoTemplate({kind:"idle"});
    try { setRemovalPreview(await previewDemoRemoval()); }
    catch(err) { setDemoTemplate({kind:"error",message:userMessage(err,"Gösterim verisi önizlemesi yüklenemedi. Yeniden deneyin.")}); }
    finally { importingDemo.current = false; setRemoving(false); }
  }
  async function confirmRemoval() {
    if (!removalPreview || importingDemo.current) return;
    importingDemo.current = true; setRemoving(true);
    try {
      const result = await removeDemoTemplate(removalPreview.token);
      setRemovalPreview(null); setDemoCoverage(null); setUsersRevision(n=>n+1);
      setDemoTemplate({kind:"done",message:`${result.removed_records} gösterim kaydı kaldırıldı.${result.kept_users ? ` Kullanılmış veya değiştirilmiş ${result.kept_users} hesap korundu.` : ""}`});
    } catch(err) {
      setRemovalPreview(null);
      setDemoTemplate({kind:"error",message:userMessage(err,"Gösterim verileri kaldırılamadı. Önizlemeyi yeniden açıp deneyin.")});
    } finally { importingDemo.current = false; setRemoving(false); }
  }

  if (loading) return <div className="space-y-5"><AppearanceSettings /><LoadingState /></div>;
  if (error) return <div className="space-y-5"><AppearanceSettings /><ErrorState message={error} /></div>;

  const isAdmin = me?.role === "admin";

  if (me?.is_platform_admin) return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1><p className="text-sm text-navy-500">Uygulamanın ortak AI bağlantısını yönetin.</p></div>
      <AppearanceSettings />
      <AiConnectionPanel canManageSecrets />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1>
        <p className="text-sm text-navy-500">Büro ve kullanıcı ayarlarınızı yönetin.</p>
      </div>
      <AppearanceSettings />

      {isAdmin && (
        <section aria-labelledby="settings-demo-template" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <h2 id="settings-demo-template" className="mb-2 text-sm font-medium text-navy-700">Gösterim verileri</h2>
          <p className="mb-4 text-sm text-navy-500">Dava dosyaları paketinde ceza ve hukuk davalarının evrakları bulunur. Büro verileri paketi dört avukat, aktif işler, mali kayıtlar ve takvim etkinlikleri içerir. Daha önce yüklediğiniz paketi yeniden seçerek eksik kayıtları tamamlayabilirsiniz.</p>
          <button type="button" onClick={() => addExamples("dossiers")} disabled={demoTemplate.kind === "sending" || removing || !!removalPreview}
            className="mr-2 mb-2 rounded-xl bg-accent-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">20 dava dosyasını yükle</button>
          <button type="button" onClick={() => addExamples("bureau")} disabled={demoTemplate.kind === "sending" || removing || !!removalPreview}
            className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
            {demoTemplate.kind === "sending" ? "Ekleniyor..." : "Gösterim verilerini yükle"}
          </button>
          <button ref={removalTrigger} type="button" onClick={previewRemoval} disabled={demoTemplate.kind === "sending" || removing || !!removalPreview} className="ml-2 mt-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60">{removing ? "İşleniyor…" : "Gösterim verilerini kaldır"}</button>
          {removalPreview && <ModalFrame title="Gösterim verilerini kaldır" onClose={() => {if(!removing)setRemovalPreview(null);}} busy={removing}>
            <p className="text-sm leading-6 text-navy-700">Yalnız bu büroya yüklenen şablon kayıtları kalıcı olarak kaldırılacak. 20 davalık pakette kullanıcı içeriği eklenmiş dava dosyaları korunur. Eski büro şablonundaki davalar, sonradan eklediğiniz belgelerle birlikte kaldırılır. Bu işlem geri alınamaz; şablonu yeniden yükleyebilirsiniz.</p>
            <dl className="my-4 space-y-2 text-sm text-navy-700">{Object.entries(removalPreview.counts).map(([label,count])=><div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
            <p className="text-sm leading-6 text-navy-600">Şablon dışı dosyalarınız, gerçek kullanıcılarınız, büro ayarları ve AI anahtarları korunur. {removalPreview.kept_users > 0 && `${removalPreview.kept_users} hesap kullanıldığı veya değiştirildiği için korunacak.`}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" data-autofocus disabled={removing} onClick={()=>setRemovalPreview(null)} className="rounded-xl border border-surface-border px-4 py-2 text-sm text-navy-700 disabled:opacity-50">Vazgeç</button><button type="button" disabled={removing || removalPreview.total_records === 0} onClick={confirmRemoval} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{removing ? "Kaldırılıyor…" : "Onayla ve verileri kaldır"}</button></div>
          </ModalFrame>}
          {demoTemplate.kind === "done" && <p role="status" className="mt-3 text-sm text-emerald-700">{demoTemplate.message}</p>}
          {demoCoverage && <div className="mt-4"><h3 className="text-sm font-medium text-navy-800">Büroda gösterime hazır veriler</h3><dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(demoCoverage).map(([label,count]) => <div key={label} className="flex justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>)}</dl><div className="mt-3 flex flex-wrap gap-4 text-sm text-accent-700"><Link href="/davalar">Dava dosyalarını aç →</Link><Link href="/buro">Büro yönetimine git →</Link></div></div>}
          {demoTemplate.kind === "error" && <p role="alert" className="mt-3 text-sm text-red-700">{demoTemplate.message}</p>}
        </section>
      )}

      <AiConnectionPanel canManageSecrets={isAdmin} />
      {isAdmin && <p className="text-sm text-navy-600">Buradan eklediğiniz AI anahtarı yalnızca bu büronun işlemlerinde kullanılır. Diğer büroların bağlantısı değişmez.</p>}

      {notifications && (
        <section aria-labelledby="settings-notifications" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <h2 id="settings-notifications" className="mb-3 text-sm font-medium text-navy-700">
            Bildirimler
          </h2>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-navy-500">E-posta yöntemi</dt>
            <dd className="text-navy-800">{EMAIL_BACKEND_LABELS[notifications.email_backend]}</dd>
            <dt className="text-navy-500">Hatırlatmalar</dt>
            <dd className="text-navy-800">
              {notifications.reminders_enabled
                ? `Açık — her gün ${String(notifications.reminder_send_hour).padStart(2, "0")}:00'dan sonra (${notifications.timezone})`
                : "Kapalı"}
            </dd>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendTest}
              aria-disabled={testEmail.kind === "sending"}
              className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60"
            >
              {testEmail.kind === "sending" ? "Gönderiliyor..." : "Test e-postası gönder"}
            </button>
            {testEmail.kind === "done" && (
              <p role="status" className="text-sm text-emerald-700">
                {testEmail.message}
              </p>
            )}
            {testEmail.kind === "error" && (
              <p role="alert" className="text-sm text-red-700">
                {testEmail.message}
              </p>
            )}
          </div>
        </section>
      )}

      {isAdmin && me ? (
        <UsersPanel key={usersRevision} currentUser={me} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
          <p className="text-sm text-navy-500">Kullanıcı yönetimi sadece yöneticiler içindir.</p>
        </div>
      )}
    </div>
  );
}
