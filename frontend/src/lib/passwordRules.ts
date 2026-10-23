/** Client-side password rules, mirroring the server's (the server decides). */

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt only uses the first 72 bytes (UTF-8) of a password, so longer ones
 * are refused instead of being silently truncated. Replaces the old
 * 128-character cap, which 72 bytes makes unreachable. */
export const MAX_PASSWORD_BYTES = 72;
export const PASSWORD_HINT = "En az 10 karakter olmalı ve e-posta adresinizle aynı olamaz.";

const utf8 = new TextEncoder();

/** The first problem with a new password, or null when it is acceptable.
 * `email` is optional: without it only length and confirmation are checked. */
export function validateNewPassword(password: string, confirm: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Şifre en az 10 karakter olmalı.";
  if (utf8.encode(password).length > MAX_PASSWORD_BYTES) {
    return "Şifre en fazla 72 bayt olabilir (Türkçe karakterler 2 bayt sayılır).";
  }
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Şifre e-posta adresinizle aynı olamaz.";
  if (password !== confirm) return "Şifreler eşleşmiyor.";
  return null;
}
