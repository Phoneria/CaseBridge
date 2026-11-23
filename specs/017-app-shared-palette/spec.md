# Shared marketing palette in the application (v.0.45)

User request (23 Nov 2026): carry the marketing site's colours and tones into the application; keep both themes, dark as default.

## User Scenarios
A lawyer opening the app sees the same navy, paper and turquoise world as casebridge.com.tr. Outcome colours (won/kabul turquoise, lost/ret red, partial amber, info blue) mean the same thing on the site, the probability tree, dashboards and reports. Users who previously chose the light theme keep it; everyone else starts in dark.

### Functional Requirements
- **FR-001**: Define one palette (dark: page #08131f, surface #0d1d2e, border #1f3449, text #eee8d9, muted #a9b8c7, accent #68dfcf; light: page #f3f1ec, navy text scale, accent 600 #0c7468) and apply it through the existing theme tokens, Tailwind scales and dark-theme overrides.
- **FR-002**: Use the same semantic outcome colours across dashboard, admin, reports, finance, probability tree and knowledge map.
- **FR-003**: Self-host Manrope (SIL OFL) as the application typeface, as on the marketing site.
- **FR-004**: Keep dark as the default theme and the light theme selectable; keep WCAG AA contrast for body text and accent buttons; keep the existing logo image.
- **FR-006**: (v.0.46, user feedback 23 Nov 2026) Every colour utility resolves to a per-role CSS variable (text, background, border) generated from one token file, so hover, focus, aria and opacity variants switch theme automatically; light-tint backgrounds hovered in the dark theme stay readable.
- **FR-007**: All text colours used in the app meet WCAG AA (4.5:1) on the surface they are rendered on, including hover states, in both themes; checked automatically over every class list in the source.
- **FR-008**: Charts take grid, axis, label, centre-value, tooltip, hover-cursor, primary and halo colours from theme variables; case statuses use one colour each everywhere (active teal, hearing blue, decision amber, closed neutral).
- **FR-009**: Drawers and modals sit on a theme-aware scrim with a visible edge, so the panel reads as separate from the page in the dark theme.
- **FR-005**: Verify type checks, the full frontend suite and visual inspection of login, dashboard, cases, case detail and bureau in both themes; release as application v.0.45 through the standard path.

## Success Criteria
Palette test passes; 795+ frontend tests pass; screens render in both themes with no console errors; public app reports v.0.45 with health ok.
