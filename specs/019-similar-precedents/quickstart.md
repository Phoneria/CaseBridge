# Quickstart
cd backend && python -m pytest tests/api/test_similar_precedents.py -q
cd frontend && npx vitest run src/components/__tests__/SimilarPrecedentsSidebar.test.tsx src/components/__tests__/CaseDetailView.test.tsx && npx tsc --noEmit
