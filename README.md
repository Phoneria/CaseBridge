# CaseBridge prototype

CaseBridge is an AI-assisted legal triage and verified-lawyer marketplace for local and cross-border cases. This repository contains a functional, production-style prototype using realistic mock data; it does not provide legal advice.

## Run locally

1. Install Node.js 22.13 or later.
2. Install dependencies with `npm install`.
3. Start the prototype with `npm run dev`.
4. Open the local address shown by the development server.

No API keys are required. Copy `.env.example` to `.env.local` only when connecting optional integrations.

## Demo credentials

- Individual: `user@casebridge.demo` / `demo123`
- Lawyer: `lawyer@casebridge.demo` / `demo123`

The sign-in screen also provides one-click demo access.

## Main demo paths

- Landing, registration and pricing
- Individual dashboard, seven-step case wizard and autosaved draft
- Simulated AI analysis, structured preliminary case report and anonymous publishing
- Lawyer marketplace, anonymized case detail and representation offer
- Lawyer dashboard, analytics, professional profile and secure messages
- English and Turkish landing-page localization with a persisted preference

## Structure

- `app/` — App Router pages and global design system
- `components/` — reusable shell and interface primitives
- `features/` — public, individual and lawyer product surfaces
- `lib/` — AI abstraction, data models, jurisdictions, seed data and optional Supabase client
- `messages/` — localization dictionaries

## Current prototype limitations

- Authentication, file uploads, messaging, offers and publishing are simulated in the browser.
- AI methods return deterministic mocked responses.
- Supabase is optional and is not connected without environment variables.
- Pricing is explicitly illustrative; no billing is performed.
- Legal output is preliminary, qualitative and always requires licensed-lawyer review.

## Planned production integrations

- Supabase Auth, PostgreSQL row-level security and private Storage buckets
- jurisdiction-reviewed legal knowledge sources and auditable AI workflows
- real lawyer license verification, secure consent logs and document access policies
- notifications, billing, moderation, malware scanning and retention controls
- full English, Turkish, German, French, Spanish and Arabic localization
