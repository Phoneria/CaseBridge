# Validation
frontend: npm test -- src/components/__tests__/WorkspaceGuide.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx; npm run build.
Root: python3 scripts/check-specs.py; python3 scripts/check-spec-changes.py --help.
Browser: synthetic getMe only with empty data responses; 1440/390/320 light/dark. Open header Rehber; topic/forward/back/restart/exit; Tab wrap/Escape focus return. Verify zero guide network writes, no overflow, roles and /buro?tab context. Record actual results in verification.md. No production session/key.
