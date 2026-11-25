# Quickstart
cd backend && python -m pytest tests/api/test_chat_data_tools.py tests/api/test_chat.py tests/api/test_precedents.py -q
cd frontend && npx vitest run src/lib/__tests__/mascot.test.ts src/components/__tests__/AiMascot.test.tsx src/lib/__tests__/api.test.ts && npx tsc --noEmit
