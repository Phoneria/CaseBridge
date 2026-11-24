# Quickstart
cd backend && python -m pytest tests/api/test_platform_firms.py tests/api/test_platform_management.py -q
cd frontend && npx vitest run src/components/__tests__/PlatformView.test.tsx && node scripts/update-version.mjs --check
