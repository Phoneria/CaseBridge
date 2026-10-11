import { describe, expect, it } from "vitest";

import { OPEN_CASE_STATUSES, OUTCOME_SLUG_LABELS, OUTCOME_SLUGS } from "@/lib/filters";
import { CASE_OUTCOME_LABELS } from "@/lib/labels";

describe("outcome labels", () => {
  it("uses the same four words everywhere, with Sulh instead of Uzlaşma", () => {
    expect(CASE_OUTCOME_LABELS).toEqual({
      ongoing: "Devam ediyor",
      won: "Kazanıldı",
      lost: "Kaybedildi",
      settled: "Sulh",
    });
    expect(OUTCOME_SLUG_LABELS.sulh).toBe("Sulh");
    expect(OUTCOME_SLUGS.sulh).toBe("settled");
    expect(JSON.stringify([CASE_OUTCOME_LABELS, OUTCOME_SLUG_LABELS])).not.toMatch(/uzla/i);
  });
});

describe("open statuses", () => {
  it("are the three statuses a case can be edited between", () => {
    expect(OPEN_CASE_STATUSES).toEqual(["devam_eden", "durusma_bekleyen", "karar_bekleyen"]);
  });
});
