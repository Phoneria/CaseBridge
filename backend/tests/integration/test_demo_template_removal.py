"""Explicit template removal preserves all non-template/other-firm data."""
from pathlib import Path

from app.db.demo_outcomes import template_numbers
from app.models.case import Case, CaseType
from app.models.document import Document
from app.models.user import User
from app.models.management import FirmProfile, WorkspaceAccess


def test_removal_preview_confirm_repeat_and_reload_preserve_real_data(client,db_session,office,auth_headers):
    from sqlalchemy import text
    db_session.execute(text("PRAGMA foreign_keys=ON"));db_session.commit()
    headers=auth_headers(office.admin_a)
    assert client.post('/admin/demo-template',headers=headers).status_code==200
    real=Case(law_firm_id=office.firm_a.id,case_number='REAL-KEEP',case_name='Gerçek dosya',client_name='Gerçek taraf',case_type=CaseType.KIRA,assigned_lawyer_id=office.lawyer_a1.id)
    other=Case(law_firm_id=office.firm_b.id,case_number='ÖRNEK-2026/001',case_name='Diğer büro',client_name='Diğer taraf',case_type=CaseType.KIRA,description='[ÖRNEK ŞABLON] Diğer büro')
    profile=db_session.get(FirmProfile,office.firm_a.id)
    profile.data={'ai_budget':{'token_budget':42}}
    db_session.add_all([real,other,profile]);db_session.commit()
    docs=db_session.query(Document).filter_by(law_firm_id=office.firm_a.id).all()
    paths=[Path(d.storage_path) for d in docs]
    before=db_session.query(Case).count()
    preview=client.get('/admin/demo-template/removal-preview',headers=headers)
    assert preview.status_code==200,preview.text
    assert preview.json()['counts']['Davalar ve emsaller'] == len(template_numbers()) + 3
    assert db_session.query(Case).count()==before and all(p.is_file() for p in paths)
    assert client.post('/admin/demo-template/remove',headers=headers,json={'token':preview.json()['token'],'confirm':False}).status_code==422
    removed=client.post('/admin/demo-template/remove',headers=headers,json={'token':preview.json()['token'],'confirm':True})
    assert removed.status_code==200,removed.text
    assert removed.json()['removed_records']>200
    assert db_session.query(Case).count()==2
    assert db_session.get(Case,real.id).case_name=='Gerçek dosya'
    assert db_session.get(Case,other.id).case_name=='Diğer büro'
    assert db_session.get(FirmProfile,office.firm_a.id).data=={'ai_budget':{'token_budget':42}}
    assert all(not p.exists() for p in paths)
    assert db_session.query(User).filter_by(law_firm_id=office.firm_a.id).count()==3
    empty=client.get('/admin/demo-template/removal-preview',headers=headers).json()
    assert empty['total_records']==0
    assert client.post('/admin/demo-template/remove',headers=headers,json={'token':empty['token'],'confirm':True}).json()['removed_records']==0
    assert client.post('/admin/demo-template',headers=headers).status_code==200
    assert client.get('/admin/demo-template/removal-preview',headers=headers).json()['counts']['Gösterim kullanıcıları']==9


def test_removal_rejects_stale_scope_and_preserves_adopted_users(client,db_session,office,auth_headers):
    from app.db.demo_team import roster_ids
    headers=auth_headers(office.admin_a)
    assert client.post('/admin/demo-template',headers=headers).status_code==200
    preview=client.get('/admin/demo-template/removal-preview',headers=headers).json()
    member=sorted(roster_ids(office.firm_a.id))[0]
    real=Case(law_firm_id=office.firm_a.id,case_number='REAL-ADOPT',case_name='Korunacak',client_name='Gerçek taraf',case_type=CaseType.KIRA,assigned_lawyer_id=member)
    db_session.add(real);db_session.flush()
    adopted=sorted(roster_ids(office.firm_a.id))[1]
    adopted_user=db_session.get(User,adopted)
    adopted_user.full_name='Kullanılmaya başlanmış hesap'
    adopted_grant=db_session.query(WorkspaceAccess).filter_by(user_id=adopted).one()
    adopted_grant.case_ids=[*adopted_grant.case_ids,real.id]
    db_session.commit()
    stale=client.post('/admin/demo-template/remove',headers=headers,json={'token':preview['token'],'confirm':True})
    assert stale.status_code==409
    assert db_session.query(Case).filter_by(law_firm_id=office.firm_a.id).count() == len(template_numbers()) + 4
    fresh=client.get('/admin/demo-template/removal-preview',headers=headers).json()
    assert fresh['kept_users']==2
    assert client.post('/admin/demo-template/remove',headers=headers,json={'token':fresh['token'],'confirm':True}).status_code==200
    assert db_session.get(User,member) is not None
    assert db_session.get(Case,real.id).assigned_lawyer_id==member
    grant=db_session.query(WorkspaceAccess).filter_by(user_id=member).one()
    assert grant.case_ids==[] and grant.position=='lawyer'
    assert db_session.get(User,adopted).full_name=='Kullanılmaya başlanmış hesap'
    assert db_session.query(WorkspaceAccess).filter_by(user_id=adopted).one().case_ids==[real.id]
    assert client.get('/admin/demo-template/removal-preview',headers=auth_headers(office.lawyer_a1)).status_code==403


def test_removal_rolls_back_without_unlinking_files(client,db_session,office,auth_headers,monkeypatch):
    import app.db.demo_template_removal as removal
    headers=auth_headers(office.admin_a)
    assert client.post('/admin/demo-template',headers=headers).status_code==200
    preview=client.get('/admin/demo-template/removal-preview',headers=headers).json()
    docs=db_session.query(Document).filter_by(law_firm_id=office.firm_a.id).all()
    paths=[Path(d.storage_path) for d in docs]
    original=removal.remove_template
    def fail(db,admin,selected):
        original(db,admin,selected)
        raise RuntimeError('synthetic rollback')
    monkeypatch.setattr(removal,'remove_template',fail)
    import pytest
    with pytest.raises(RuntimeError,match='synthetic rollback'):
        client.post('/admin/demo-template/remove',headers=headers,json={'token':preview['token'],'confirm':True})
    assert db_session.query(Case).filter_by(law_firm_id=office.firm_a.id).count() == len(template_numbers()) + 3
    assert all(p.exists() for p in paths)
