# Research: S02 Main kaynaklı değişmez yayın

- Decision: Root-owned inventory, origin/main-only clean git archive, image IDs and static hashes; fixed deploy/rollback entrypoint; read-only app rootfs; separate /app/storage; no changes to existing root/izzet administrator access.
- Rationale: meets approved scope while preserving existing data/roles and release evidence.
- Alternatives: wholesale redesign, fabricated UI/probabilities, mutable server checkout and credential changes rejected as outside scope or unsafe.
- Evidence: main fdf7333 and Emin 134e881; official Spec Kit 1.4.3. Release permissions and tree reuse additionally reviewed by read-only research agents.
- Unresolved blocking questions: none for non-destructive implementation; removing existing administrator access remains excluded pending explicit approval.
