"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { clearToken, getAuthConfig, getMe, login, setToken } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";

export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // The hint is optional: if the call fails the form simply has no hint.
    getAuthConfig()
      .then((config) => {
        if (active) setDemoMode(config.demo_mode);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    let stored = false;
    try {
      const { access_token } = await login(email, password);
      setToken(access_token);
      stored = true;
      const user = await getMe();
      // Stay locked on success: the page is navigating away.
      router.push(user.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      // A token stored for a profile we could not read must not stay behind.
      if (stored) clearToken();
      setError(userMessage(err, "Giriş yapılamadı. Lütfen tekrar deneyin."));
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className={AUTH_LABEL}>
            E-posta
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <div>
          <label htmlFor="password" className={AUTH_LABEL}>
            Şifre
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
          {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
        <p className="text-center text-sm">
          <Link href="/sifremi-unuttum" className="text-accent-700 hover:underline">
            Şifremi unuttum
          </Link>
        </p>
      </form>

      {demoMode && (
        <div className="mt-6 rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-xs text-navy-600">
          <p className="mb-1 font-medium text-navy-700">Demo hesapları</p>
          <p>Yönetici: admin@demo.casebridge.dev</p>
          <p>Avukat: avukat@demo.casebridge.dev</p>
          <p>Şifre: demo1234</p>
        </div>
      )}
    </AuthCard>
  );
}
