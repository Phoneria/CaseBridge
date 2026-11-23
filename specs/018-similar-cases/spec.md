# Similar cases, stage 1 (application v.0.47)

User request (23 Nov 2026): find cases similar to a case, or to a described dispute, among the bureau's own cases (archived and closed included) and its precedent archive. Stage 1 uses no AI call and no migration; stage 2 (AI) is out of scope.

## User Scenarios
1. A lawyer opens a case and sees a "Benzer davalar" card with the five closest files: score, result badge, duration, responsible lawyer, the reasons for the match, and a link to each file.
2. A lawyer opens CaseBridge AI → Benzer Dava Bul, picks a case or describes a dispute in free text (optionally with a category), and gets the same ranked list.
3. Another bureau's data never appears, and no user sees a case they could not already open.

### Functional Requirements
- **FR-001**: Candidates are the session bureau's cases, including archived and closed ones, and the bureau's precedent archive (`is_precedent`). The bureau comes only from the authenticated session; no other bureau's rows are read or returned.
- **FR-002**: Access follows the existing read rules unchanged: a source case outside the bureau, or a precedent used as a source, is a 404; restricted workspace accounts get 403 from the shared dependency; anonymous requests get 401. Every result is a case the caller can already open through `GET /cases/{id}` or `GET /precedents/{id}`.
- **FR-003**: `GET /cases/{id}/similar?limit=5` (1–20) and `POST /similar-cases/search {text, case_type?, limit?}` return the ranked list. Empty or whitespace-only text is a 422; text without meaningful words and no category returns an empty list.
- **FR-004**: Score 0–100 = structured pre-filter (same category 15, same court type 10 derived from the court name, same client role 5, case-value closeness up to 10) plus text similarity (60): Turkish normalisation (dotted/dotless I lower-casing, punctuation removal, stop words, five-letter prefix stems) and TF-IDF cosine over case_name, claim, facts_summary, plaintiff_position, defendant_position and description. Signals the source cannot provide are left out of the denominator. A candidate needs text similarity ≥ 0.08 or the same category.
- **FR-005**: The source case and its numbered siblings (same file number with a `-1`/`-2` suffix) are excluded.
- **FR-006**: Each result returns case_id, case_number, case_name, case_type, status, outcome, decision_date, duration in days (to the decision; for an open case to today, flagged ongoing), assigned_lawyer_name, is_precedent, score and human-readable reasons (e.g. "Aynı kategori: Kira", "Benzer talep: kira farkı").
- **FR-007**: The case detail shows a "Benzer davalar" card with the first five results and an empty state; CaseBridge AI gains a "Benzer Dava Bul" page (`/ai/benzer-davalar`) with a case picker or free text, using the same list component.
- **FR-008**: Colours use only existing theme token classes; result badges take the chartTheme status/outcome colours; theme contrast tests pass in both themes. No new table, column, migration, heavy dependency or AI call; computation is per request with a short per-bureau in-process cache invalidated by case changes. Application version becomes v.0.47.

## Success Criteria
Backend similar-case tests (ranking, bureau isolation, lawyer access, self/sibling exclusion, empty text) and the full backend suite pass; tsc and the full Vitest suite pass, including the card, page and empty-state tests and themeContrast; check-specs and check-spec-changes pass; the card and page render in dark and light themes against a local demo backend without console errors.
