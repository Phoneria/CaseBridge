"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { forgotPassword } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";

const SENT_MESSAGE = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(userMessage(err, "İstek gönderilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Şifremi unuttum">
      {sent ? (
        <p role="status" className="text-sm text-navy-700">
          {SENT_MESSAGE}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-navy-500">E-posta adresinizi yazın; şifrenizi sıfırlamanız için bir bağlantı gönderelim.</p>
          <div>
            <label htmlFor="forgot-email" className={AUTH_LABEL}>
              E-posta
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={AUTH_INPUT}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
            {submitting ? "Gönderiliyor..." : "Bağlantı gönder"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent-700 hover:underline">
          Giriş sayfasına dön
        </Link>
      </p>
    </AuthCard>
  );
}
