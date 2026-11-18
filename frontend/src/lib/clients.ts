import type { ClientType } from "@/types";

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = { person: "Kişi", company: "Şirket" };

export function formatTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

/** A light check before sending; the server validates the address properly. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
