/**
 * Shared CaseBridge palette (marketing site v.0.54+ and the application).
 * Accent 600 is the light-theme Bridge wordmark; the dark theme uses accent 300 (#68dfcf),
 * the same turquoise as casebridge.com.tr.
 */
export const BRAND_ACCENT = {
  50: "#ecfaf7",
  100: "#d2f3ec",
  200: "#a6e8da",
  300: "#68dfcf",
  400: "#35c3b0",
  500: "#14907f",
  600: "#0c7468",
  700: "#0b5f56",
  800: "#0b4c46",
  900: "#0a3d39",
};

/** Meaning-bearing colours, identical in both themes and on the marketing site. */
export const OUTCOME_COLORS = {
  won: "#1fb5a3",
  lost: "#e36b5f",
  partial: "#edb45d",
  info: "#5b8def",
  neutral: "#8fa3b8",
  rose: "#d98aa8",
};

export const BRAND_CHART_COLORS = [
  OUTCOME_COLORS.won,
  OUTCOME_COLORS.info,
  OUTCOME_COLORS.partial,
  OUTCOME_COLORS.rose,
  BRAND_ACCENT[600],
  OUTCOME_COLORS.neutral,
];
