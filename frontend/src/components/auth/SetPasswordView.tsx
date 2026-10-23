"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { getMe, getTokenInfo, setPassword } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { homePath } from "@/lib/home";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/passwordRules";
import { userMessage } from "@/lib/userMessages";
import type { TokenInfo } from "@/types";

const LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.";

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; info: TokenInfo };

export function SetPasswordView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    getTokenInfo(token).then(
      (info) => {
        if (active) setPhase({ kind: "ready", info });
      },
      (err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 410) setPhase({ kind: "invalid" });
        else setPhase({ kind: "failed", message: userMessage(err, "Bağlantı doğrulanamadı. Lütfen sayfayı yenileyin.") });
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || phase.kind !== "ready") return;
    const problem = validateNewPassword(password, confirm, phase.info.email);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await setPassword(token, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setPhase({ kind: "invalid" });
      else setError(userMessage(err, "Şifre belirlenemedi. Lütfen tekrar deneyin."));
      inFlight.current = false;
      setSubmitting(false);
      return;
    }
    // The password is set and the new token stored: continue to the right home page.
    try {
      const user = await getMe();
      router.replace(homePath(user));
    } catch {
      router.replace("/login");
    }
  }

  if (phase.kind === "loading") {
    return (
      <AuthCard>
        <p role="status" className="text-sm text-navy-500">
          Bağlantı doğrulanıyor...
        </p>
      </AuthCard>
    );
  }

  if (phase.kind === "invalid" || phase.kind === "failed") {
    return (
      <AuthCard title="Bağlantı geçersiz">
        <p role="alert" className="text-sm text-navy-700">
          {phase.kind === "invalid" ? LINK_INVALID : phase.message}
        </p>
        <p className="mt-4 flex flex-col gap-2 text-center text-sm">
          <Link href="/login" className="text-accent-700 hover:underline">
            Giriş sayfasına dön
          </Link>
          <Link href="/sifremi-unuttum" className="text-accent-700 hover:underline">
            Şifremi unuttum
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Şifrenizi belirleyin">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-navy-600">Merhaba {phase.info.full_name}, CaseBridge şifrenizi belirleyin.</p>
        <div>
          <label htmlFor="new-password" className={AUTH_LABEL}>
            Yeni şifre
          </label>
          <input
            id="new-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            aria-describedby="password-hint"
            className={AUTH_INPUT}
          />
          <p id="password-hint" className="mt-1 text-xs text-navy-500">
            {PASSWORD_HINT}
          </p>
        </div>
        <div>
          <label htmlFor="confirm-password" className={AUTH_LABEL}>
            Yeni şifre (tekrar)
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
          {submitting ? "Kaydediliyor..." : "Şifreyi belirle"}
        </button>
      </form>
    </AuthCard>
  );
}
