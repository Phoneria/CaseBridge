import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config.mjs";

describe("next.config headers", () => {
  it("sends Referrer-Policy: no-referrer for the set-password page", async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/sifre-belirle");
    expect(rule?.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
  });
});
