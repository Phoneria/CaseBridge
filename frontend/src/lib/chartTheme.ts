/**
 * Theme-aware chart colours. Values are CSS variables defined per theme in
 * src/lib/themeTokens.ts (CHART_TOKENS), so SVG charts switch with the theme.
 */
import type { CSSProperties } from "react";
import { OUTCOME_COLORS } from "./brand";

export const CHART = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  label: "var(--chart-label)",
  strong: "var(--chart-strong)",
  muted: "var(--chart-muted)",
  cursor: "var(--chart-cursor)",
  cursorLine: "var(--chart-cursor-line)",
  track: "var(--chart-track)",
  halo: "var(--chart-halo)",
  node: "var(--chart-node)",
  primary: "var(--chart-primary)",
  primarySoft: "var(--chart-primary-soft)",
} as const;

export const TOOLTIP_STYLE: CSSProperties = {
  background: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-tooltip-border)",
  color: "var(--chart-tooltip-text)",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  fontSize: 12,
};
export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: "var(--chart-tooltip-text)", fontWeight: 600 };
export const TOOLTIP_ITEM_STYLE: CSSProperties = { color: "var(--chart-tooltip-text)" };

/** One meaning per case status, identical on every screen and in both themes. */
export const STATUS_COLORS: Record<string, string> = {
  devam_eden: OUTCOME_COLORS.won,
  durusma_bekleyen: OUTCOME_COLORS.info,
  karar_bekleyen: OUTCOME_COLORS.partial,
  kapali: OUTCOME_COLORS.neutral,
};
export const statusColor = (status: string) => STATUS_COLORS[status] ?? OUTCOME_COLORS.rose;
