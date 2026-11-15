# CaseBridge marketing website

A standalone English static website. Run `python3 -m http.server 8081 --bind 127.0.0.1` in this folder, then open `http://localhost:8081/`. The monthly timeline loads local JSON and needs this local server.

No installation, external fonts, API, or internet connection is required for the website. External company links require internet access.

## Files

- `index.html`: page content and inline, expandable biographies.
- `styles.css`: responsive blue, turquoise, white, and red styling.
- `script.js`: mobile navigation, screenshot tabs, and keyboard-accessible product tabs.
- `assets/`: real application screenshots and team portraits.
- `timeline.html`: interactive 60-month plan, with year filters and downloadable CSV/Excel sheets.
- `planning/monthly-roadmap.xlsx`: editable monthly model and roadmap; the monthly figures reconcile to the existing annual forecast.
- `planning/risk-scenario.json` and `.csv`: illustrative downside calculations, including revenue, expenses, standby retainers, crisis response and cash buffer targets.
- `assets/MEDIA_CREDITS.md`: origins and licenses of the real meeting photo and geographic map used in the new visuals.
- `profiles/`: downloadable Markdown biographies. Izzet’s and Ahmet’s biographies are supplied by the user. Bengü and Hatice profiles include clearly marked provisional drafts.

When updating a biography, update both its Markdown file and its matching inline biography in `index.html`. Use the downward arrow on the right of each team member to expand their biography within the page. Native details elements work offline and support keyboard navigation; no pop-up or network request is involved.

The screenshots show fictional courtroom training. The 74/100 is a training score, not a validated probability of winning a case. No live application sign-in has been added.


## Market and growth narrative

The site includes founder-reported three-firm traction, five feedback-led product additions, 15 sourced competitor examples, TAM/SAM/SOM with explicit assumptions, the lab-data business thesis, a 2027–2031 growth plan, seed allocation and risk responses.

`business-plan.js` renders target and no-licensing financial scenarios using embedded JSON, so it works offline. `planning/business-plan.json` stores the assumptions and source URLs; `planning/revenue-plan.csv` exports the target-case annual plan. The financial scenarios are illustrative, not historical performance or contracted revenue. Research date: 25 October 2026.

The proposed $1.5m seed covers a 24-month planning envelope; actual cash needs depend on receipts, delivery timing and working capital. Licensing is conditional on rights, privilege, privacy, quality, lawful transfers and actual buyer demand. Company-supplied feature descriptions are not an independent technical verification of every deployment.

The timeline charts compare monthly and annual base targets with an illustrative downside case: 20% fewer paying customers, 25% lower commission receipts, a three-month lab receipt delay, on-call staffing retainers and five explicitly budgeted crisis events. The risk case is not a probabilistic forecast. Its cash buffer target equals the greater of $150,000 or three months of modeled risk-case expenses, including the current month. Holding that cash is a liquidity target, not a P&L expense. Only retainers and crisis response costs are expensed. Rebuild the risk JSON/CSV after changing the base monthly plan with `python planning/build-risk.py`; `planning/build-roadmap.mjs` then exports the Excel workbook with a Risk case sheet.


## Overview interaction

The page presents the product, three-firm Turkey POC, team, market sizing, financial forecasts, investor ask and growth roadmap without requiring clicks. Optional product detail, competitor comparisons, biographies, risks and sources expand inline. Only optional panels collapse when they scroll fully out of view. Category bars, phase counters and the allocation donut animate as they enter the viewport; reduced-motion preferences are respected. Revenue and cost scenarios, individual years and category bars are interactive. Selecting a year opens a chart; selecting a category opens annual customer-cohort or spending-driver tables. Annual targets are $100k / $600k / $4m / $15m / $40m. Year 5 comprises $30m data licensing, $5.01m subscriptions and $4.99m marketplace commissions; these are aggressive, unvalidated planning assumptions. Commission revenue assumes a future non-legal software/service marketplace with a 10% take rate. Potential customer examples imply no relationship or confirmed demand.

Bengü now uses the newly supplied personal photograph, optimized as `assets/team/bengu-ozbek-current.jpg`. Bengü’s biography remains a provisional draft. Hatice’s biography uses the supplied Technarts event-platform/IPAM experience and long-standing oil-painting interest, with no year counts.

## Visual identity and market graphics

The header and footer use an integrated CaseBridge wordmark: one fine bridge line connects the two e letters. Its tagline is “Every case. End to end.” `assets/casebridge-e2e.svg` is the standalone vector version. The first-meeting panel edits a real consultation photograph to show illustrative question prompts. The market section uses a geographic map derived from Natural Earth data, a SAM composition donut with selectable formula breakdowns, and a SOM/SAM share ring. These charts preserve existing sourced estimates and distinguish planning assumptions. The annual financial table has a large caption and colored revenue, cost and result columns.


## Hero case map

The hero keeps its original copy beside a connected SVG mind map, without an application frame. `hero-case-map.css` scopes its layout to the hero. `hero-case-map.js` renders six primary branches and nineteen secondary nodes with cross-links, selectable branches and TR/EN translations through the existing language system. The graph is an illustrative preparation workflow and does not present a live case analysis. Keyboard users can select nodes with Enter or Space; reduced-motion preferences disable decorative animation.

## Actual AI screen gallery

The “A practical assistant. Across the whole case.” section now uses three direct browser captures from the existing application instead of the meeting illustration and concept SVGs. `ai-screen-gallery.js` controls accessible vertical tabs and a native in-page enlargement dialog; `ai-screen-gallery.css` provides responsive layout. Its labels integrate with the existing TR/EN translator. The captured application itself is in Turkish.

Capture provenance and exact crops are recorded in `assets/AI_SCREENSHOTS.md`. All three images show the same existing fictional training hearing and its 73/100 feedback, with no UI reconstruction or generated image assets.

## Finance overview and optional detail

The finance section now opens with the proposed $1.5m seed, 24-month planning horizon, five allocation percentages and three short growth stages. The original annual financial model, capital assumptions and monthly/risk roadmap are preserved inside two initially closed native details panels. `finance-overview.css` styles the summary; `finance-overview.js` supplies its TR/EN labels. All existing model IDs and financial inputs are retained. Timeline hash links open the monthly detail panel through the existing deep-link handler; the roadmap's year buttons also open its ancestor panel before scrolling.
