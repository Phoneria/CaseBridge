# Quickstart
cd backend && python -m pytest tests/unit/test_udf_reader.py tests/api/test_documents.py tests/api/test_case_intake.py tests/api/test_privacy_files.py tests/api/test_bureau_management.py tests/unit/test_import_cases.py tests/integration -q
cd frontend && npx vitest run src/components/__tests__/IntakeFillBox.test.tsx src/lib/__tests__/caseIntake.test.ts && node scripts/update-version.mjs --check
python3 -m unittest scripts.tests.test_udf_import -v
