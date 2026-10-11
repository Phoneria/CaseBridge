"use client";

import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { changePassword, getMe, updateProfile } from "@/lib/api";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/passwordRules";
import { announceUserUpdated } from "@/lib/userEvents";
import { userMessage } from "@/lib/userMessages";
import type { AppUser } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const LABEL = "text-xs font-medium text-navy-600";
const BUTTON =
  "rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60";
const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";

type Notice = { kind: "ok" | "error"; message: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === "ok" ? (
    <p role="status" className="text-sm text-emerald-700">{notice.message}</p>
  ) : (
    <p role="alert" className="text-sm text-red-700">{notice.message}</p>
  );
}

export function AccountView() {
  const [me, setMe] = useState<AppUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileInFlight = useRef(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const passwordInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getMe().then(
      (result) => {
        if (!active) return;
        setMe(result);
        setFullName(result.full_name);
        setDepartment(result.department ?? "");
      },
      () => {
        if (active) setLoadError("Hesap bilgileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (profileInFlight.current) return;
    if (!fullName.trim()) {
      setProfileNotice({ kind: "error", message: "Ad soyad boş olamaz." });
      return;
    }
    profileInFlight.current = true;
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      const updated = await updateProfile({ full_name: fullName, department: department.trim() || null });
      setMe(updated);
      setFullName(updated.full_name);
      setDepartment(updated.department ?? "");
      announceUserUpdated(updated);
      setProfileNotice({ kind: "ok", message: "Bilgileriniz güncellendi." });
    } catch (err) {
      setProfileNotice({ kind: "error", message: userMessage(err, "Bilgileriniz güncellenemedi. Lütfen tekrar deneyin.") });
    } finally {
      profileInFlight.current = false;
      setSavingProfile(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordInFlight.current || !me) return;
    const problem = validateNewPassword(newPassword, confirmPassword, me.email);
    if (problem) {
      setPasswordNotice({ kind: "error", message: problem });
      return;
    }
    passwordInFlight.current = true;
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      // changePassword stores the new token: the other sessions end, this one goes on.
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({ kind: "ok", message: "Şifreniz değiştirildi." });
    } catch (err) {
      setPasswordNotice({ kind: "error", message: userMessage(err, "Şifre değiştirilemedi. Lütfen tekrar deneyin.") });
    } finally {
      passwordInFlight.current = false;
      setSavingPassword(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} />;
  if (!me) return <LoadingState />;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Hesabım</h1>
        <p className="text-sm text-navy-500">Bilgilerinizi ve şifrenizi yönetin.</p>
      </div>

      <section aria-labelledby="account-profile" className={CARD}>
        <h2 id="account-profile" className="mb-3 text-sm font-medium text-navy-700">Profil</h2>
        <form onSubmit={saveProfile} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-name" className={LABEL}>Ad soyad</label>
              <input id="account-name" value={fullName} maxLength={255} onChange={(e) => setFullName(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-department" className={LABEL}>Departman</label>
              <input id="account-department" value={department} maxLength={100} onChange={(e) => setDepartment(e.target.value)} className={INPUT} />
            </div>
          </div>
          <dl className="grid grid-cols-[100px_1fr] gap-y-1 text-sm">
            <dt className="text-navy-500">E-posta</dt>
            <dd className="text-navy-800">{me.email}</dd>
            <dt className="text-navy-500">Rol</dt>
            <dd className="text-navy-800">{me.role === "admin" ? "Yönetici" : "Avukat"}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" aria-disabled={savingProfile} className={BUTTON}>
              {savingProfile ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <NoticeLine notice={profileNotice} />
          </div>
        </form>
      </section>

      <section aria-labelledby="account-password" className={CARD}>
        <h2 id="account-password" className="mb-3 text-sm font-medium text-navy-700">Şifre değiştir</h2>
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="current-password" className={LABEL}>Mevcut şifre</label>
              <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-new-password" className={LABEL}>Yeni şifre</label>
              <input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-describedby="account-password-hint" className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-confirm-password" className={LABEL}>Yeni şifre (tekrar)</label>
              <input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} />
            </div>
          </div>
          <p id="account-password-hint" className="text-xs text-navy-500">{PASSWORD_HINT}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" aria-disabled={savingPassword} className={BUTTON}>
              {savingPassword ? "Kaydediliyor..." : "Şifreyi değiştir"}
            </button>
            <NoticeLine notice={passwordNotice} />
          </div>
        </form>
      </section>
    </div>
  );
}
