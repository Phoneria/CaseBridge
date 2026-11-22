# Implementation Plan: Müvekkiller

## Summary
Büroya ait `clients` tablosu eklenir; bağlantı davadaki taraf üzerinden (`case_parties.client_id`) kurulur. `/clients` API'si, dava API'sindeki taraf kuralları, müvekkil listesi/detayı ekranları ve dava formundaki müvekkil seçici aynı modeli kullanır. Ayrıntılı adımlar [uygulama planındadır](../../docs/superpowers/plans/2026-11-16-clients.md).

## Technical Context
Next.js 14/React 18/TypeScript; FastAPI/Pydantic/SQLAlchemy/Alembic. Yeni bağımlılık, model/API sağlayıcı çağrısı, anahtar veya erişim değişikliği yoktur. Bir şema+veri migration'ı ve main ile birleşmeden doğan boş bir Alembic merge revision'ı vardır.

## Constitution Check
PASS. II: büro kapsamı oturumdan gelir; başka büronun müvekkili 404, davada başka büronun `client_id`'si 422 döner; negatif ve izolasyon testleri vardır. III: gerçek veri veya anahtar yoktur; müvekkil adı ve iletişim bilgisi loglanmaz. VI: mevcut roller korunur; silme yalnızca büro yöneticisine açıktır; yeni kenar çubuğu öğesi mevcut gezinme ve klavye odağını bozmaz. VII: uygulama sürümü v.0.24'e çıkar. V: yayın yalnızca main'den, mevcut kısıtlı yayın yoluyla yapılır.

## Research and Design
Bkz. research.md ve data-model.md#featurecontract.

## Project Structure
backend/app/models/client.py, case.py; backend/app/services/client_names.py, client_service.py, case_parties.py, case_service.py; backend/app/api/routes/clients.py, cases.py; backend/app/schemas/client.py, case.py; backend/app/repositories/case_repository.py; backend/app/db/seed.py, import_cases.py, demo_cleanup.py; backend/alembic/versions/c8f2a4e6b0d1_add_clients.py, eeb771ad79be_merge_clients_and_bureau_heads.py; frontend/src/app/muvekkiller/; ClientListView, ClientDetailView, ClientFormModal, case-form/ClientPicker, case-form/PartiesFields, NewCaseView, CasePartiesCard, Sidebar; frontend/src/lib/clients.ts, caseIntake.ts, api.ts; frontend/src/types/index.ts.

## Validation and Release
Backend birim/API/migration testleri, frontend vitest ve tip denetimi, sürüm denetimi; E2E `19-clients` ve güncellenen `01-case-lifecycle`. Yayından önce pilot veritabanı yedeklenir; migration backend açılışındaki `alembic upgrade head` ile uygulanır. Main'den sabitlenmiş artifact, canary, geri alma ve public sürüm/kod/health doğrulaması mevcut yayın yoluyla yapılır.
