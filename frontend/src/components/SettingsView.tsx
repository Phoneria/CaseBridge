"use client";

import { useEffect, useRef, useState } from "react";

import { getMe, getNotificationStatus, importDemoTemplate, sendTestEmail } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, NotificationStatus } from "@/types";
import { AiConnectionPanel } from "@/components/AiConnectionPanel";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
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
  const [demoTemplate, setDemoTemplate] = useState<TestEmailState>({ kind: "idle" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sendingTest = useRef(false);
  const importingDemo = useRef(false);

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

  async function addExamples() {
    if (importingDemo.current) return;
    importingDemo.current = true;
    setDemoTemplate({ kind: "sending" });
    try {
      const result = await importDemoTemplate();
      setDemoTemplate({ kind: "done", message: result.added_cases
        ? `${result.added_cases} örnek dava ve ilişkili veriler büronuza eklendi.`
        : "Örnek veriler zaten mevcut; yeni kayıt eklenmedi." });
    } catch (err) {
      setDemoTemplate({ kind: "error", message: userMessage(err, "Örnek veriler eklenemedi. Lütfen tekrar deneyin.") });
    } finally {
      importingDemo.current = false;
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const isAdmin = me?.role === "admin";

  if (me?.is_platform_admin) return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1><p className="text-sm text-navy-500">Uygulamanın ortak AI bağlantısını yönetin.</p></div>
      <AiConnectionPanel canManageSecrets />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1>
        <p className="text-sm text-navy-500">Büro ve kullanıcı ayarlarınızı yönetin.</p>
      </div>

      {isAdmin && (
        <section aria-labelledby="settings-demo-template" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <h2 id="settings-demo-template" className="mb-2 text-sm font-medium text-navy-700">Örnek veriler</h2>
          <p className="mb-4 text-sm text-navy-500">Kurgusal davaları, görevleri, belgeleri ve olayları bu büroya ekleyin. Mevcut kayıtlar korunur.</p>
          <button type="button" onClick={addExamples} disabled={demoTemplate.kind === "sending"}
            className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60">
            {demoTemplate.kind === "sending" ? "Ekleniyor..." : "Örnek verileri yükle"}
          </button>
          {demoTemplate.kind === "done" && <p role="status" className="mt-3 text-sm text-emerald-700">{demoTemplate.message}</p>}
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
        <UsersPanel currentUser={me} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
          <p className="text-sm text-navy-500">Kullanıcı yönetimi sadece yöneticiler içindir.</p>
        </div>
      )}
    </div>
  );
}
