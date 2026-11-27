# 3D story homepage (marketing v.0.54)

User request (23 Nov 2026): rebuild the marketing homepage from scratch so a visitor sees five capabilities in 3D and is impressed — historical case analysis (what would have gone better), the probability tree (how a live case may end and how moves change it), data anonymisation, bureau management (which lawyer wins which case types, where deadlines slip) and Sufle (prompts during a client meeting) — and replace the live site.

## User Scenarios
A law-firm visitor scrolls one continuous story. A case file opens into a network (hero); a closed case rewinds and an alternative branch lights up; a probability tree grows and re-weights when the visitor toggles moves; a petition is scanned and its personal data masked, then locked in a vault; a bureau's lawyers appear as 3D columns with approaching deadlines; a conversation waveform produces sourced prompt cards. The visitor can then inspect the real application tree snapshot, read the team and FAQ, and request a demo.

### Functional Requirements
- **FR-001**: Replace the homepage with a six-scene scroll story (hero + the five capabilities) in Turkish, with the existing CaseBridge wordmark, the real demo calendar URL, app login and image-credits link. Retain the existing team section, the real application Kira Ağacı snapshot and the separate visible marketing version.
- **FR-002**: Render the scenes with one WebGL canvas driven by native scroll (no scroll capture or hijacking), pointer parallax, reduced-motion support (no idle animation), a no-WebGL fallback (readable copy, working tree controls, original hero film) and no-JS readable content. The 3D module is a single self-contained file so the existing static release copier ships every asset.
- **FR-003**: Keep claims truthful: all demo data is labelled fictional; tree percentages are stated once as scenario assumptions, not calibrated winning probabilities; masking requires human review; no invented customers, testimonials, pricing or unverified volume claims (the previous "10 TB / 100.000+" figures are removed).
- **FR-004**: Probability-tree moves recompute the branch weights and the outcome distribution consistently in both the 3D scene and the DOM list; initial outcomes total 100%.
- **FR-005**: Verify desktop/mobile rendering, console errors, overflow and frame rate in a real browser, run repository suites, increment the marketing version, publish marketing-only through the existing main-sourced release path and verify public version and hashes.

- **FR-006**: Team feedback (23 Nov): the hero headline keeps clear space below the fixed header at short viewports; hero pages carry readable fictional legal text; pages turn into labelled document nodes one by one and more slowly, without covering the hero copy.
- **FR-007**: Team feedback: 3D labels always render in front of geometry; the probability tree grows edge by edge from left to right while scrolling (with an appeal branch after Ret) and the camera follows; hero nodes settle into a line and fly into the case timeline; the inline application tree moves to its own linked page; a sixth scene shows the courtroom rehearsal (you as counsel, AI opposing counsel and judge, 4 × 25 training evaluation).
- **FR-008**: Team feedback: the hero network is handed to the timeline scene unchanged (same nodes, names, links, no fade) and its documents travel one by one onto their events over a longer scroll; all probability-tree labels stay inside the frame while the tree grows.
- **FR-009**: Fast wheel/trackpad scrolling is never blocked; scene progress follows the scroll position with damping and a speed limit so transitions play out smoothly even at maximum scroll speed; reduced-motion users get the direct (undamped) mapping.
- **FR-010**: User request (23 Nov): inside the six story chapters, wheel/trackpad scrolling is applied at a capped speed (about 1.1 screen heights per second, at most 1.2 screens queued per fling) so every transition is seen. Keyboard, scrollbar, anchor links and touch stay native; zoom gestures, horizontal gestures and reduced-motion users are not intercepted; team, FAQ and footer scroll normally. This is a deliberate, scoped exception to FR-002's no-capture rule.
- **FR-011**: Bug fix: once the wheel leaves the story (team, FAQ, footer), any pending capped glide is cancelled so the page stays where the visitor scrolled and is never pulled back up.
- **FR-012**: User request (27 Nov): the header (and footer) show the supplied CASE/BRIDGE logo (navy serif "CASE", gold arc, "BRIDGE") instead of the teal CaseBridge wordmark, and the homepage, 3D scene and site cat switch from the dark navy/teal palette to a light soft-yellow and light-brown palette; marketing-only v.0.69.

## Success Criteria
All six scenes render on 1440×900 and 390×844 without overflow or console errors; tree moves change both views; acceptance tests in `scripts/tests/test_story_3d.py` pass; public `/website-version.json` reports v.0.54 and serves the new `story3d.js`.

## Constitution exception
Principle VI asks marketing to preserve the existing theme/video. The user explicitly requested a from-scratch redesign on 23 Nov 2026; the theme changes to dark, the original film is kept only as the no-WebGL hero fallback. Logo identity is preserved.
