import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_ACCENT, OUTCOME_COLORS } from "../brand";
import { THEMES } from "../themeTokens";

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
    expect(THEMES.dark.singles).toMatchObject({ "bg-white": "#0d1d2e", "bg-surface-muted": "#08131f" });
    expect(THEMES.dark.tx.navy["900"]).toBe("#eee8d9");
    expect(THEMES.dark.tx.accent["600"]).toBe("#68dfcf");
    expect(read("src/app/theme.css")).toContain('background-color:#08131f; color:#eee8d9;');
    const tailwind = read("tailwind.config.ts");
    expect(tailwind).toContain('950: "#08131f"');
    expect(tailwind).toContain('"Manrope"');
    expect(tailwind).toContain('themeVariables("dark")');
    expect(read("src/app/globals.css")).toContain('url("/fonts/manrope-latin-v23.woff2")');
  });

  it("keeps readable contrast and defaults to the dark theme", () => {
    expect(contrast(BRAND_ACCENT[600], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#eee8d9", "#0d1d2e")).toBeGreaterThanOrEqual(7);
    expect(contrast(THEMES.dark.tx.navy["500"], "#0d1d2e")).toBeGreaterThanOrEqual(4.5);
    expect(read("src/lib/theme.ts")).toContain('var t="dark"');
  });
});
