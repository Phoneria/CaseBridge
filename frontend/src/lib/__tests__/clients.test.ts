import { describe, expect, it } from "vitest";

import { CLIENT_TYPE_LABELS, formatTry, isValidEmail } from "@/lib/clients";

describe("client helpers", () => {
  it("labels the client types in Turkish", () => {
    expect(CLIENT_TYPE_LABELS).toEqual({ person: "Kişi", company: "Şirket" });
  });

  it("formats lira without decimals", () => {
    expect(formatTry(1750)).toBe(new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(1750));
  });

  it("accepts a plain e-mail and rejects obvious mistakes", () => {
    expect(isValidEmail("ali@example.com")).toBe(true);
    expect(isValidEmail("ali@")).toBe(false);
    expect(isValidEmail("ali example.com")).toBe(false);
  });
});
