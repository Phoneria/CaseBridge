"""Initialize only a disposable local SQLite database for the demo-team browser check."""
import json
import os
from pathlib import Path

root = Path('/tmp/casebridge-expanded-team-browser')
root.mkdir(exist_ok=True)
os.environ.update(DATABASE_URL=f'sqlite:///{root}/test.db', JWT_SECRET='local-synthetic-team-check', ENV='test', LLM_PROVIDER='mock', CHAT_PROVIDER='mock', OPENAI_API_KEY='', STORAGE_DIR=str(root/'storage'))
from app.db.base import Base
from app.db.session import engine, SessionLocal
import app.models
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.case import Case, CaseType
from app.services.auth_service import DUMMY_PASSWORD_HASH, AuthService
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)
with SessionLocal() as db:
    firm = LawFirm(name='Kurgusal örnek ekip kontrolü')
    db.add(firm); db.flush()
    admin = User(law_firm_id=firm.id,email='synthetic-admin@example.invalid',full_name='Örnek Yönetici',role=UserRole.ADMIN,hashed_password=DUMMY_PASSWORD_HASH)
    lawyer = User(law_firm_id=firm.id,email='synthetic-lawyer@example.invalid',full_name='Mevcut Sentetik Avukat',role=UserRole.LAWYER,hashed_password=DUMMY_PASSWORD_HASH)
    db.add_all([admin,lawyer]);db.flush()
    real_boundary = Case(law_firm_id=firm.id,case_number='SYNTHETIC-BOUNDARY',case_name='Şablon dışı sentetik dosya',client_name='Kurgusal taraf',case_type=CaseType.KIRA,assigned_lawyer_id=lawyer.id)
    db.add(real_boundary);db.commit()
    (root/'session.json').write_text(json.dumps({'token':AuthService(db).issue_token_for(admin),'realCaseId':real_boundary.id}))
print('Disposable local database initialized')
