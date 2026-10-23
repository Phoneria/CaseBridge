import { describe, expect, it } from "vitest";

import {
  EMPTY_HEARING_FORM,
  buildHearingFields,
  hasHearingErrors,
  hearingFormFromHearing,
  hearingWhen,
  nextHearing,
  splitHearings,
  validateHearingForm,
  validateResultNote,
} from "@/lib/hearings";
import type { CaseHearing } from "@/types";

function hearing(overrides: Partial<CaseHearing> = {}): CaseHearing {
  return {
    id: "h1", starts_at: "2099-01-05T10:30:00", all_day: false, duration_minutes: 45, location: "3. Asliye Hukuk",
    notes: "Tanık dinlenecek", assignee_id: null, result_note: null, is_past: false, result_open: false, ...overrides,
  };
}

describe("hearing form rules", () => {
  it("requires a date, and a time and valid duration unless the hearing is all day", () => {
    expect(validateHearingForm(EMPTY_HEARING_FORM)).toEqual({ date: "Tarih zorunludur." });
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", time: "" })).toEqual({ time: "Saat zorunludur." });
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", duration: "4" })).toEqual({
      duration: "Süre 5 ile 1440 dakika arasında olmalıdır.",
    });
    expect(hasHearingErrors(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05" }))).toBe(false);
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", all_day: true, time: "", duration: "" })).toEqual({});
  });

  it("builds naive local datetimes and trims optional text", () => {
    expect(buildHearingFields({ date: "2099-01-05", time: "14:30", all_day: false, duration: "90", location: " Salon 2 ", notes: " " })).toEqual({
      starts_at: "2099-01-05T14:30:00", all_day: false, duration_minutes: 90, location: "Salon 2", notes: null,
    });
    expect(buildHearingFields({ ...EMPTY_HEARING_FORM, date: "2099-01-05", all_day: true }).starts_at).toBe("2099-01-05T00:00:00");
  });

  it("fills the edit form from a hearing", () => {
    expect(hearingFormFromHearing(hearing())).toEqual({
      date: "2099-01-05", time: "10:30", all_day: false, duration: "45", location: "3. Asliye Hukuk", notes: "Tanık dinlenecek",
    });
    expect(hearingFormFromHearing(hearing({ all_day: true, starts_at: "2099-01-05T00:00:00" })).time).toBe("09:00");
  });
});

describe("hearing display and result rules", () => {
  it("shows date and time, or 'Tüm gün'", () => {
    expect(hearingWhen(hearing())).toBe("05.01.2099 · 10:30");
    expect(hearingWhen(hearing({ all_day: true, starts_at: "2099-01-05T00:00:00" }))).toBe("05.01.2099 · Tüm gün");
  });

  it("requires a trimmed result note of at most 4000 characters", () => {
    expect(validateResultNote("   ")).toBe("Sonuç notu gerekli.");
    expect(validateResultNote("a".repeat(4001))).toBe("En fazla 4000 karakter olabilir.");
    expect(validateResultNote(" Ara karar verildi. ")).toBeUndefined();
  });

  it("splits upcoming (earliest first) from past (latest first) and picks the next hearing", () => {
    const a = hearing({ id: "a", starts_at: "2099-03-01T10:00:00" });
    const b = hearing({ id: "b", starts_at: "2099-02-01T10:00:00" });
    const c = hearing({ id: "c", starts_at: "2001-01-01T10:00:00", is_past: true });
    const d = hearing({ id: "d", starts_at: "2002-01-01T10:00:00", is_past: true });
    const { upcoming, past } = splitHearings([a, c, b, d]);
    expect(upcoming.map((h) => h.id)).toEqual(["b", "a"]);
    expect(past.map((h) => h.id)).toEqual(["d", "c"]);
    expect(nextHearing([a, c, b])?.id).toBe("b");
    expect(nextHearing([c])).toBeNull();
  });
});
