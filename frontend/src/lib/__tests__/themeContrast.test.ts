/**
 * Colour contrast checks for both themes (WCAG AA, 4.5:1 for text).
 * Scans every class string in src/ and evaluates each text colour against the
 * background it is rendered on, including hover states.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { CHART_TOKENS, DARK_ON_ACCENT, THEMES, contrast, luminance, resolveUtility, type ThemeName } from "../themeTokens";

const SRC = path.resolve(__dirname, "../..");
const AA = 4.5;
const THEME_NAMES: ThemeName[] = ["light", "dark"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every quoted string or template chunk that looks like a class list. */
const classLists = files(SRC).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/["'`]([^"'`\n]*\b(?:text|bg)-[a-z][^"'`\n]*)["'`]/g)].map((m) => ({ file: path.relative(SRC, file), classes: m[1].split(/\s+/) }));
});

const COLOR = /^(text|bg)-(navy|accent|red|rose|amber|emerald|sky|blue|slate|white|surface)(?:-(\d+|muted|border))?$/;
const pick = (classes: string[], prefix: string, kind: "text" | "bg") =>
  classes.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length)).find((c) => COLOR.test(c) && c.startsWith(`${kind}-`));

const SURFACES: Record<ThemeName, string[]> = {
  light: [THEMES.light.singles["bg-white"], THEMES.light.singles["bg-surface-muted"]],
  dark: [THEMES.dark.singles["bg-white"], THEMES.dark.singles["bg-surface-muted"], "#15283b"],
};
const PANEL: Record<ThemeName, string> = { light: THEMES.light.bg.navy["950"], dark: THEMES.dark.bg.navy["950"] };
const INK_ON_ACCENT = new Set(["bg-accent-500", "bg-accent-600", "bg-accent-700"]);

function ink(theme: ThemeName, textClass: string, bgClass?: string) {
  if (theme === "dark" && bgClass && INK_ON_ACCENT.has(bgClass)) return DARK_ON_ACCENT;
  return resolveUtility(theme, textClass)!;
}
/** Light inks (white, *-50…300) are only ever placed on dark panels. */
const isPanelInk = (textClass: string) => luminance(resolveUtility("light", textClass)!) > 0.45;

describe("theme contrast", () => {
  it("every text colour reads on the surface it is used on", () => {
    const failures = new Set<string>();
    for (const { file, classes } of classLists) {
      for (const state of ["", "hover:"]) {
        if (state && !pick(classes, state, "text") && !pick(classes, state, "bg")) continue;
        const text = (state ? pick(classes, state, "text") : undefined) ?? pick(classes, "", "text");
        if (!text) continue;
        const bg = (state ? pick(classes, state, "bg") : undefined) ?? pick(classes, "", "bg");
        for (const theme of THEME_NAMES) {
          const behind = bg ? [resolveUtility(theme, bg)!] : isPanelInk(text) ? [PANEL[theme]] : SURFACES[theme];
          for (const b of behind) {
            const ratio = contrast(ink(theme, text, bg), b);
            if (ratio < AA) failures.add(`${theme} ${file}: ${state}${text} on ${bg ?? b} = ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect([...failures].sort()).toEqual([]);
  });

  it("hover states keep text readable and stay distinguishable", () => {
    const sidebar = readFileSync(path.join(SRC, "components/Sidebar.tsx"), "utf8");
    expect(sidebar).toContain("hover:bg-accent-100 hover:text-accent-800");
    for (const theme of THEME_NAMES) {
      const hoverBg = resolveUtility(theme, "bg-accent-100")!;
      expect(contrast(resolveUtility(theme, "text-accent-800")!, hoverBg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(hoverBg, resolveUtility(theme, "bg-accent-50")!)).toBeGreaterThan(1.1);
    }
  });

  it("chart text and the bar hover cursor follow the theme", () => {
    for (const theme of THEME_NAMES) {
      const t = CHART_TOKENS[theme];
      const card = THEMES[theme].singles["bg-white"];
      for (const key of ["axis", "label", "strong", "muted", "tooltip-text"]) {
        const behind = key === "tooltip-text" ? t["tooltip-bg"] : card;
        expect(contrast(t[key], behind), `${theme} chart ${key}`).toBeGreaterThanOrEqual(AA);
      }
      expect(contrast(t.primary, card), `${theme} primary bar`).toBeGreaterThanOrEqual(3);
      expect(contrast(t["primary-soft"], t.primary), `${theme} stacked bars`).toBeGreaterThanOrEqual(1.8);
      expect(t.cursor).toMatch(/^rgba\(.+,\s*\.\d+\)$/);
    }
  });

  it("charts take colours from theme variables, not fixed hex values", () => {
    for (const file of ["DashboardView", "AdminView", "AnalyticsView", "ReportsView"]) {
      const text = readFileSync(path.join(SRC, `components/${file}.tsx`), "utf8");
      expect(text, file).not.toMatch(/(fill|stroke|stopColor)[=:]\s*["']#[0-9a-fA-F]{3,6}["']/);
      expect(text, file).not.toMatch(/BRAND_ACCENT\[/);
    }
  });
});
