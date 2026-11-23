/**
 * Single source of truth for application colours in both themes.
 *
 * Every Tailwind colour utility the app uses (text-*, bg-*, border-*, ring-*,
 * divide-*, gradient stops) resolves to a CSS variable. The light theme keeps
 * the familiar values; the dark theme swaps the variables, so hover:, aria-,
 * disabled: and /alpha variants follow automatically instead of needing one
 * hand-written override per class.
 *
 * Roles differ on purpose: text-navy-900 must become light in the dark theme,
 * while bg-navy-900 (dark buttons and panels) must stay dark.
 */
import { BRAND_ACCENT } from "./brand";

export const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
export type Shade = (typeof SHADES)[number];
export type Ramp = Record<Shade, string>;
export type Role = "tx" | "bg" | "bd";
export const FAMILIES = ["navy", "accent", "red", "rose", "amber", "emerald", "sky", "blue", "slate"] as const;
export type Family = (typeof FAMILIES)[number];
export type ThemeName = "light" | "dark";

const ramp = (values: string[]): Ramp => Object.fromEntries(SHADES.map((shade, i) => [shade, values[i]])) as Ramp;

/** Light base values (Tailwind 3 defaults for status colours). */
const BASE: Record<Family, Ramp> = {
  navy: ramp(["#f4f6f8", "#e6ebf0", "#c9d3dd", "#9aabbd", "#6b8199", "#45607c", "#2c4763", "#1d3550", "#14283d", "#0d1d2e", "#08131f"]),
  accent: ramp([...SHADES.slice(0, 10).map((s) => BRAND_ACCENT[Number(s) as keyof typeof BRAND_ACCENT]), "#062a27"]),
  red: ramp(["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a"]),
  rose: ramp(["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"]),
  amber: ramp(["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f", "#451a03"]),
  emerald: ramp(["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"]),
  sky: ramp(["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985", "#0c4a6e", "#082f49"]),
  blue: ramp(["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"]),
  slate: ramp(["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"]),
};

const with_ = (base: Ramp, patch: Partial<Ramp>): Ramp => ({ ...base, ...patch });

/** Light text: mid shades darkened where the default fails WCAG AA (4.5:1) on white. */
const LIGHT_TX: Record<Family, Ramp> = {
  ...BASE,
  navy: with_(BASE.navy, { "400": "#5a7088" }),
  accent: with_(BASE.accent, { "500": "#0e776a" }),
  red: with_(BASE.red, { "500": "#c62828", "600": "#c81e1e" }),
  rose: with_(BASE.rose, { "600": "#be123c" }),
  amber: with_(BASE.amber, { "600": "#a8540a", "700": "#a1470a" }),
  emerald: with_(BASE.emerald, { "600": "#047857" }),
  sky: with_(BASE.sky, { "600": "#0369a1" }),
  slate: with_(BASE.slate, { "400": "#64748b" }),
};

/**
 * Dark text. Shades 50–300 are only used as text on dark panels already, so
 * they keep their light values; 400+ become light inks on dark surfaces.
 */
const lightTint = (fam: Family, rest: string[]) => ramp([...SHADES.slice(0, 4).map((s) => BASE[fam][s]), ...rest]);
const DARK_TX: Record<Family, Ramp> = {
  navy: lightTint("navy", ["#94a8bc", "#a9b9c9", "#c3cfdb", "#d6dee6", "#eee8d9", "#eee8d9", "#f6f2e8"]),
  accent: ramp(["#ecfaf7", "#d2f3ec", "#a6e8da", "#68dfcf", "#68dfcf", "#68dfcf", "#68dfcf", "#7fe6d8", "#a6efe5", "#c4f5ee", "#dcf9f4"]),
  red: lightTint("red", ["#f5b5ad", "#f1a49b", "#f1a49b", "#f1a49b", "#f6c3bc", "#f9d4cf", "#fbe3df"]),
  rose: lightTint("rose", ["#f3b3c8", "#f0a9c2", "#f0a9c2", "#f0a9c2", "#f5c3d5", "#f8d4e1", "#fbe4ec"]),
  amber: lightTint("amber", ["#f3cf8f", "#f0c987", "#f0c987", "#f0c987", "#f5d7a3", "#f8e2bd", "#fbecd3"]),
  emerald: lightTint("emerald", ["#a9e9d1", "#9fe3c9", "#9fe3c9", "#9fe3c9", "#b9ecd8", "#cdf2e4", "#e0f7ee"]),
  sky: lightTint("sky", ["#bfd2f7", "#a9c2f5", "#a9c2f5", "#a9c2f5", "#c5d6f8", "#d6e2fa", "#e5edfc"]),
  blue: lightTint("blue", ["#bfd2f7", "#a9c2f5", "#a9c2f5", "#a9c2f5", "#c5d6f8", "#d6e2fa", "#e5edfc"]),
  slate: lightTint("slate", ["#94a8bc", "#a9b9c9", "#d4dbe2", "#d4dbe2", "#eee8d9", "#eee8d9", "#f6f2e8"]),
};

/** Dark backgrounds: tints become deep washes, buttons stay solid and visible. */
const DARK_BG: Record<Family, Ramp> = {
  navy: ramp(["#132538", "#172b40", "#1f3449", "#2c4763", "#45607c", "#6b8199", "#33526f", "#2a4b6e", "#22405f", "#1d3550", "#050d17"]),
  accent: ramp(["#0f3036", "#134048", "#1a5560", "#24706f", "#35c3b0", "#4fd3c1", "#68dfcf", "#9fece1", "#b8f2e9", "#d2f3ec", "#ecfaf7"]),
  red: ramp(["#2b1d21", "#3a2228", "#4a2b31", "#69414a", "#e36b5f", "#e36b5f", "#b4473d", "#9c3b32", "#7f3029", "#5c231e", "#3a1613"]),
  rose: ramp(["#2b1d24", "#3a2230", "#4a2b3b", "#6b4152", "#d98aa8", "#d98aa8", "#a8456a", "#913a5b", "#76304a", "#5a2438", "#3a1724"]),
  amber: ramp(["#2b271a", "#3a321c", "#4d4120", "#655630", "#edb45d", "#edb45d", "#a46f1f", "#8a5c19", "#6e4d19", "#4f3712", "#33230b"]),
  emerald: ramp(["#10302c", "#143b35", "#1c4d44", "#2a6a5c", "#3fcf9f", "#1fb5a3", "#11796a", "#0f6b5d", "#0c564b", "#0a4239", "#062a24"]),
  sky: ramp(["#132a46", "#18355a", "#20436f", "#2d5a8f", "#5b8def", "#5b8def", "#3a6bc8", "#2f59a8", "#26488a", "#1d386b", "#13264a"]),
  blue: ramp(["#132a46", "#18355a", "#20436f", "#2d5a8f", "#5b8def", "#5b8def", "#3a6bc8", "#2f59a8", "#26488a", "#1d386b", "#13264a"]),
  slate: ramp(["#132538", "#1a2c40", "#22374d", "#6b8199", "#8fa3b8", "#8fa3b8", "#45607c", "#33495f", "#22374d", "#172b40", "#0d1d2e"]),
};

const DARK_BD: Record<Family, Ramp> = {
  navy: ramp(["#1a2e43", "#1f3449", "#284159", "#35506c", "#4c6782", "#6b8199", "#2c4763", "#22405f", "#1a3049", "#14283d", "#0d1d2e"]),
  accent: ramp(["#163a40", "#1d4a52", "#24505a", "#2e6670", "#68dfcf", "#68dfcf", "#68dfcf", "#9fece1", "#b8f2e9", "#d2f3ec", "#ecfaf7"]),
  red: ramp(["#3a2228", "#4a2b31", "#69414a", "#8a525a", "#c9665b", "#e36b5f", "#e36b5f", "#f1a49b", "#f1a49b", "#f1a49b", "#f1a49b"]),
  rose: ramp(["#3a2230", "#4a2b38", "#6b4152", "#8a5268", "#c27896", "#d98aa8", "#d98aa8", "#f0a9c2", "#f0a9c2", "#f0a9c2", "#f0a9c2"]),
  amber: ramp(["#3a321c", "#4d4120", "#655630", "#7d6a35", "#a8873c", "#edb45d", "#edb45d", "#f0c987", "#f0c987", "#f0c987", "#f0c987"]),
  emerald: ramp(["#143b35", "#1c4d44", "#2a5a4c", "#2f7364", "#3fcf9f", "#1fb5a3", "#1fb5a3", "#9fe3c9", "#9fe3c9", "#9fe3c9", "#9fe3c9"]),
  sky: ramp(["#18355a", "#20436f", "#2a4d7c", "#35609a", "#4a78cf", "#5b8def", "#5b8def", "#3a6bc8", "#2f4f86", "#26488a", "#1d386b"]),
  blue: ramp(["#18355a", "#20436f", "#2a4d7c", "#35609a", "#4a78cf", "#5b8def", "#5b8def", "#3a6bc8", "#2f4f86", "#26488a", "#1d386b"]),
  slate: ramp(["#1a2e43", "#1f3449", "#284159", "#35506c", "#4c6782", "#6b8199", "#2c4763", "#22405f", "#1a3049", "#14283d", "#0d1d2e"]),
};

export type Singles = {
  /** bg-white: the card surface. text-white and border-white never change. */
  "bg-white": string;
  "bg-surface": string;
  "bg-surface-muted": string;
  "bg-surface-border": string;
  "bd-surface": string;
  "bd-surface-muted": string;
  "bd-surface-border": string;
};

export const THEMES: Record<ThemeName, { tx: Record<Family, Ramp>; bg: Record<Family, Ramp>; bd: Record<Family, Ramp>; singles: Singles }> = {
  light: {
    tx: LIGHT_TX,
    /* emerald-600 carries white button text; the default is too light. */
    bg: { ...BASE, emerald: with_(BASE.emerald, { "600": "#047857", "700": "#065f46" }) },
    bd: BASE,
    singles: {
      "bg-white": "#ffffff",
      "bg-surface": "#ffffff",
      "bg-surface-muted": "#f3f1ec",
      "bg-surface-border": "#e1ddd3",
      "bd-surface": "#ffffff",
      "bd-surface-muted": "#f3f1ec",
      "bd-surface-border": "#e1ddd3",
    },
  },
  dark: {
    tx: DARK_TX,
    bg: DARK_BG,
    bd: DARK_BD,
    singles: {
      "bg-white": "#0d1d2e",
      "bg-surface": "#0d1d2e",
      "bg-surface-muted": "#08131f",
      "bg-surface-border": "#213851",
      "bd-surface": "#0d1d2e",
      "bd-surface-muted": "#08131f",
      "bd-surface-border": "#213851",
    },
  },
};

/** Ink used on solid light-teal fills (bg-accent-500+) in the dark theme. */
export const DARK_ON_ACCENT = "#06201d";

/** Chart and SVG colours, exposed as CSS variables (see chartTheme.ts). */
export const CHART_TOKENS: Record<ThemeName, Record<string, string>> = {
  light: {
    grid: "#e6e8ef", axis: "#45607c", label: "#31465a", strong: "#0d1d2e", muted: "#45607c",
    cursor: "rgba(12,116,104,.08)", "cursor-line": "#68dfcf", track: "#e6e8ef", halo: "#ffffff",
    primary: "#0c7468", "primary-soft": "#a6e8da", "tooltip-bg": "#ffffff", "tooltip-border": "#e1ddd3",
    "tooltip-text": "#0d1d2e", node: "#ffffff",
  },
  dark: {
    grid: "#1f3449", axis: "#a9b9c9", label: "#c3cfdb", strong: "#eee8d9", muted: "#a9b9c9",
    cursor: "rgba(104,223,207,.08)", "cursor-line": "#68dfcf", track: "#1f3449", halo: "#0d1d2e",
    primary: "#68dfcf", "primary-soft": "#2a6f73", "tooltip-bg": "#13263a", "tooltip-border": "#2e6670",
    "tooltip-text": "#eee8d9", node: "#0d1d2e",
  },
};

export const SCRIM: Record<ThemeName, string> = { light: "rgb(8 19 31 / 0.38)", dark: "rgb(0 3 8 / 0.68)" };

const triplet = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};

/** CSS custom properties for one theme (rgb triplets so /alpha works). */
export function themeVariables(theme: ThemeName): Record<string, string> {
  const t = THEMES[theme];
  const vars: Record<string, string> = {};
  for (const role of ["tx", "bg", "bd"] as const)
    for (const fam of FAMILIES) for (const s of SHADES) vars[`--${role}-${fam}-${s}`] = triplet(t[role][fam][s]);
  for (const [k, v] of Object.entries(t.singles)) vars[`--${k}`] = triplet(v);
  for (const [k, v] of Object.entries(CHART_TOKENS[theme])) vars[`--chart-${k}`] = v;
  vars["--scrim"] = SCRIM[theme];
  return vars;
}

/** Resolve a utility like "text-navy-500" or "bg-white" to its hex value. */
export function resolveUtility(theme: ThemeName, utility: string): string | undefined {
  const t = THEMES[theme];
  const m = utility.match(/^(text|bg|border)-([a-z]+)(?:-(\d+|muted|border))?$/);
  if (!m) return undefined;
  const role: Role = m[1] === "text" ? "tx" : m[1] === "bg" ? "bg" : "bd";
  const [, , fam, shade] = m;
  if (fam === "white") return role === "bg" ? t.singles["bg-white"] : "#ffffff";
  if (fam === "surface") return (t.singles as Record<string, string>)[`${role}-surface${shade ? `-${shade}` : ""}`];
  if ((FAMILIES as readonly string[]).includes(fam) && shade && (SHADES as readonly string[]).includes(shade)) return t[role][fam as Family][shade as Shade];
  return undefined;
}

export function luminance(hex: string): number {
  const [r, g, b] = triplet(hex).split(" ").map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
