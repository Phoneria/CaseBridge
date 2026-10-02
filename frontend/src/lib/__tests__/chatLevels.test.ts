import { describe, expect, it } from "vitest";

import { CHAT_LEVEL_LABELS, answerLabel } from "@/lib/chatLevels";

describe("chat level labels", () => {
  it("labels the three levels in Turkish", () => {
    expect(CHAT_LEVEL_LABELS).toEqual({ basic: "Basit", standard: "Standart", deep: "Kapsamlı" });
  });

  it("builds the answer label from level and model", () => {
    expect(answerLabel("basic", "gpt-4o-mini")).toBe("Basit · gpt-4o-mini");
    expect(answerLabel("deep", null)).toBe("Kapsamlı");
    expect(answerLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(answerLabel(undefined, null)).toBeNull();
  });
});
