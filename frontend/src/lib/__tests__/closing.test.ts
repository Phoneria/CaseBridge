import { describe, expect, it } from "vitest";

import { CLOSING_OUTCOME_OPTIONS, buildClosePayload, hasCloseErrors, todayLocalISO, validateClose } from "@/lib/closing";

const today = "2026-10-11";
const valid = { outcome: "won" as const, decision_date: "2026-10-01", note: "" };

describe("closing rules", () => {
  it("offers the three outcomes with their Turkish labels", () => {
    expect(CLOSING_OUTCOME_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ["won", "Kazanıldı"],
      ["lost", "Kaybedildi"],
      ["settled", "Sulh"],
    ]);
  });

  it("formats today from the local calendar date, not from UTC", () => {
    expect(todayLocalISO(new Date(2026, 9, 11, 23, 30))).toBe("2026-10-11");
    expect(todayLocalISO(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });

  it("accepts a complete form, including today's date", () => {
    expect(hasCloseErrors(validateClose(valid, today))).toBe(false);
    expect(hasCloseErrors(validateClose({ ...valid, decision_date: today }, today))).toBe(false);
  });

  it("requires an outcome and a decision date", () => {
    const errors = validateClose({ outcome: "", decision_date: "", note: "" }, today);
    expect(errors).toEqual({ outcome: "Sonuç seçin.", decision_date: "Karar tarihi gerekli." });
  });

  it("rejects a future decision date and an over-long note", () => {
    expect(validateClose({ ...valid, decision_date: "2026-10-12" }, today).decision_date).toBe("Karar tarihi ileri bir tarih olamaz.");
    expect(validateClose({ ...valid, note: "x".repeat(4001) }, today).note).toBe("En fazla 4000 karakter olabilir.");
    expect(validateClose({ ...valid, note: "x".repeat(4000) }, today).note).toBeUndefined();
  });

  it("builds the close payload with a trimmed note, left out when blank", () => {
    expect(buildClosePayload({ ...valid, note: "  Karar tebliğ edildi.  " })).toEqual({
      outcome: "won",
      decision_date: "2026-10-01",
      note: "Karar tebliğ edildi.",
    });
    expect(buildClosePayload({ ...valid, note: "   " })).toEqual({ outcome: "won", decision_date: "2026-10-01" });
  });
});
