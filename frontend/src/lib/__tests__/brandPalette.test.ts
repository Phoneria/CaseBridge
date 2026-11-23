import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_ACCENT, OUTCOME_COLORS } from "../brand";

const root = path.resolve(__dirname, "../../..");
const read = (name: string) => readFileSync(path.join(root, name), "utf8");

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("shared marketing and application palette", () => {
  it("uses the marketing turquoise, navy and outcome colours in both themes", () => {
    expect(BRAND_ACCENT[300]).toBe("#68dfcf");
    expect(OUTCOME_COLORS).toMatchObject({ won: "#1fb5a3", lost: "#e36b5f", partial: "#edb45d", info: "#5b8def" });
    const theme = read("src/app/theme.css");
    expect(theme).toContain("--theme-accent:#68dfcf; --theme-page:#08131f; --theme-surface:#0d1d2e;");
    expect(theme).toContain("--theme-text:#eee8d9;");
    const tailwind = read("tailwind.config.ts");
    expect(tailwind).toContain('950: "#08131f"');
    expect(tailwind).toContain('"Manrope"');
    expect(read("src/app/globals.css")).toContain('url("/fonts/manrope-latin-v23.woff2")');
  });

  it("keeps readable contrast and defaults to the dark theme", () => {
    expect(contrast(BRAND_ACCENT[600], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#eee8d9", "#0d1d2e")).toBeGreaterThanOrEqual(7);
    expect(contrast("#a9b8c7", "#0d1d2e")).toBeGreaterThanOrEqual(4.5);
    expect(read("src/lib/theme.ts")).toContain('var t="dark"');
  });
});
