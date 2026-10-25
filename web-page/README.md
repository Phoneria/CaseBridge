# CaseBridge marketing website

A standalone English static website. Open `index.html` in a browser, or run `python3 -m http.server 4173 --bind 127.0.0.1` in this folder for a local preview.

No installation, external fonts, API, or internet connection is required for the website. External company links require internet access.

## Files

- `index.html`: page content and inline, expandable biographies.
- `styles.css`: responsive blue, turquoise, white, and red styling.
- `script.js`: mobile navigation, screenshot tabs, and keyboard-accessible product tabs.
- `assets/`: real application screenshots and team portraits.
- `profiles/`: downloadable Markdown biographies. Izzet’s and Ahmet’s biographies are supplied by the user. Bengü and Hatice profiles include clearly marked provisional drafts.

When updating a biography, update both its Markdown file and its matching inline biography in `index.html`. Use the downward arrow on the right of each team member to expand their biography within the page. Native details elements work offline and support keyboard navigation; no pop-up or network request is involved.

The screenshots show fictional courtroom training. The 74/100 is a training score, not a validated probability of winning a case. No live application sign-in has been added.


## Market and growth narrative

The site includes founder-reported three-firm traction, five feedback-led product additions, 15 sourced competitor examples, TAM/SAM/SOM with explicit assumptions, the lab-data business thesis, a 2027–2031 growth plan, seed allocation and risk responses.

`business-plan.js` renders target and no-licensing financial scenarios using embedded JSON, so it works offline. `planning/business-plan.json` stores the assumptions and source URLs; `planning/revenue-plan.csv` exports the target-case annual plan. The financial scenarios are illustrative, not historical performance or contracted revenue. Research date: 25 October 2026.

The proposed $1.5m seed covers a 24-month planning envelope; actual cash needs depend on receipts, delivery timing and working capital. Licensing is conditional on rights, privilege, privacy, quality, lawful transfers and actual buyer demand. Company-supplied feature descriptions are not an independent technical verification of every deployment.


## Overview interaction

The page presents the product, three-firm Turkey POC, team, market sizing, financial forecasts, investor ask and growth roadmap without requiring clicks. Optional product detail, competitor comparisons, biographies, risks and sources expand inline. Only optional panels collapse when they scroll fully out of view. Category bars, phase counters and the allocation donut animate as they enter the viewport; reduced-motion preferences are respected. Revenue and cost scenarios, individual years and category bars are interactive. Selecting a year opens a chart; selecting a category opens annual customer-cohort or spending-driver tables. Annual targets are $100k / $600k / $4m / $15m / $40m. Year 5 comprises $30m data licensing, $5.01m subscriptions and $4.99m marketplace commissions; these are aggressive, unvalidated planning assumptions. Commission revenue assumes a future non-legal software/service marketplace with a 10% take rate. Potential customer examples imply no relationship or confirmed demand.

Bengü and Hatice use the supplied `bengu.jpeg` and `hatis.jpeg` portraits, copied into versioned filenames under `assets/team`. Bengü’s biography remains a provisional draft. Hatice’s biography uses the supplied Technarts event-platform/IPAM experience and long-standing oil-painting interest, with no year counts.

## Visual identity and market graphics

The header and footer use an integrated CaseBridge wordmark: one fine bridge line connects the two e letters. Its tagline is “Every case. End to end.” `assets/casebridge-e2e.svg` is the standalone vector version. The market section uses an explicitly schematic expansion globe, a SAM composition donut with selectable formula breakdowns, and a SOM/SAM share ring. These charts preserve existing sourced estimates and distinguish planning assumptions. The annual financial table has a large caption and colored revenue, cost and result columns.
