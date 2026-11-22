# Feature Specification: Automatic versioned gallery

## User Scenarios
A visitor sees all product tabs captured from the current publicly served Turkish application after either public application or marketing version changes. Olasılık Ağacı remains first and selected.

### Functional Requirements
- **FR-001**: Detect either public version changing and refresh every currently referenced product image as one complete batch; failed or interrupted capture leaves the published gallery intact and retries automatically.
- **FR-002**: Load actual public frontend assets while every browser API request is intercepted and fulfilled from a fresh isolated synthetic backend. Never use customer accounts, data or keys.
- **FR-003**: Publish a complete provenance and hash-validated batch through protected main, immutable marketing artifacts and public byte/health verification. Retain the previous artifact for recovery.
- **FR-004**: The gallery release must advance marketing version and record its own output version so it cannot recursively trigger itself. Concurrent/newer releases invalidate the candidate.

## Success Criteria
All currently referenced image bytes match verified public images after automatic publication. Both triggers, incomplete batches, release races and self-trigger suppression have targeted executable checks. Production identities remain stable during a batch.
