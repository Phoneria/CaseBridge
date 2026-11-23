# Quickstart
cd backend && python -m pytest tests/api/test_similar_cases.py -q
cd frontend && npx vitest run src/components/__tests__/SimilarCases.test.tsx src/lib/__tests__/themeContrast.test.ts && npx tsc --noEmit
