# Quickstart
cd backend && python -m pytest tests/api/test_audit_*.py tests/unit/test_audit_service.py tests/integration/test_audit_migration.py tests/api/test_sufle.py -q
cd frontend && npx vitest run src/components/__tests__/AuditExportCard.test.tsx src/components/__tests__/PlatformView.test.tsx src/components/__tests__/NewCaseView.test.tsx && node scripts/update-version.mjs --check
