/** Client-side password rules, mirroring the server's (the server decides). */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_HINT = "En az 10 karakter olmalı ve e-posta adresinizle aynı olamaz.";

/** The first problem with a new password, or null when it is acceptable.
 * `email` is optional: without it only length and confirmation are checked. */
export function validateNewPassword(password: string, confirm: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Şifre en az 10 karakter olmalı.";
  if (password.length > MAX_PASSWORD_LENGTH) return "Şifre en fazla 128 karakter olabilir.";
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Şifre e-posta adresinizle aynı olamaz.";
  if (password !== confirm) return "Şifreler eşleşmiyor.";
  return null;
}
