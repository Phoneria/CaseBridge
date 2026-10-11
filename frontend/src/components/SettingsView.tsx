"use client";

import { useEffect, useState } from "react";

import { getAiStatus, getMe, getNotificationStatus, sendTestEmail } from "@/lib/api";
import type { AIStatus, AppUser, NotificationStatus } from "@/types";
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
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationStatus | null>(null);
  const [testEmail, setTestEmail] = useState<TestEmailState>({ kind: "idle" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getMe(), getAiStatus(), getNotificationStatus()])
      .then(([meResult, aiStatusResult, notificationResult]) => {
        setMe(meResult);
        setAiStatus(aiStatusResult);
        setNotifications(notificationResult);
      })
      .catch(() => setError("Ayarlar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function sendTest() {
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
              : `Test e-postası ${me?.email ?? "hesabınıza"} adresine gönderildi.`,
      });
    } catch (err) {
      setTestEmail({ kind: "error", message: err instanceof Error ? err.message : "E-posta gönderilemedi." });
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Ayarlar</h1>
        <p className="text-sm text-navy-500">Büro ve kullanıcı ayarlarınızı yönetin.</p>
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-navy-700">Yapay Zeka Durumu</p>
        {aiStatus && (
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                aiStatus.configured ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span className="text-navy-500">
              {aiStatus.configured ? "Hizmet hazır" : "Hizmet yapılandırılmadı"}
            </span>
          </div>
        )}
      </div>

      {notifications && (
        <section aria-labelledby="settings-notifications" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <h2 id="settings-notifications" className="mb-3 text-sm font-medium text-navy-700">
            Bildirimler
          </h2>
          <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
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
              disabled={testEmail.kind === "sending"}
              className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-60"
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
