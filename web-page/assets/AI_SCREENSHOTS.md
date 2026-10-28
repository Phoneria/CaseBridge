# CaseBridge AI application captures

Captured on 28 October 2026 from the existing Next.js application on branch `web-page` (base df5f3ef). No UI was reconstructed, no image model was used, and no conversation text was altered in the browser.

The application ran against a separate local SQLite demo database (`/tmp/casebridge-marketing-capture.db`) with its existing migrations and seed program. The screenshots show the built-in completed training example **Ödenmeyen 300.000 TL Borç**, supplied by `backend/app/db/courtroom_showcase_seed.py`: Zeynep Acar / Burak Demir, six phases, lawyer/opposing counsel/judge messages, and 73/100 training feedback. Names and facts are fictional. The transcript is an existing authored demo, not a live model response or real court record.

Source route: `/ai/durusma/oturum/82aa1b72-3d48-41a4-9195-be580a304b8e` in the isolated local database. A local same-origin proxy was used to connect frontend and backend for capture; it does not change the product UI.

Browser viewport: 1440 × 1100. All images are direct JPEG browser screenshots of the application content area, cropped to exclude the surrounding navigation. No pixels were composited or retouched.

- `ai-hearing-conversation.jpg`: x=280, y=96, width=1136, height=940; beginning of the transcript and the three roles.
- `ai-hearing-evidence.jpg`: same crop; existing transcript scrolled to the payment-record/business-plan exchange.
- `ai-hearing-evaluation.jpg`: x=280, y=96, width=1136, height=984; existing result section after using the app's “Sonuca git” link.

These are first-party CaseBridge application screenshots. The 73/100 is a practice evaluation, not a case-win probability. The application’s own fictional-training labels remain visible in the captures. The gallery serves the captured files directly and opens them in place without creating a new page.
