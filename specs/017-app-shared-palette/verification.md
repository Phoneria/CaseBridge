# Verification — 23 Nov 2026
- tsc clean; vitest 88 files / 795 tests passed before the new palette test; new palette test passes.
- Local backend (SQLite, mock AI, demo seed) + Next dev: login, dashboard, cases, case detail, bureau rendered in dark and light, no page errors.
- Release: pending (T007).

# Verification v.0.46 — 23 Nov 2026
- New themeContrast.test.ts: 0 AA failures across all class lists in both themes (light fixes: navy-400, accent-500, red-500/600, rose-600, amber-600/700, emerald/sky text, emerald-600 button).
- tsc clean; full vitest suite run (see PR).
- next build + next start with mocked API, Playwright in dark and light: sidebar hover readable, dashboard donut centre "51" readable, bar hover cursor tinted not white, admin workload legend matches bars, case drawer separated by scrim and edge.
- Release: pending (T012).
