"""Exact, firm-bounded removal of the on-demand fictional template."""
import hashlib
import json
from pathlib import Path

from sqlalchemy import or_, select
from app.db.base import Base
from app.db.demo_presentation_seed import identity
from app.db.demo_team import DEMO_LAWYERS, roster_ids, sample_cases
from app.models.case import Case
from app.models.courtroom import CourtroomScenario, CourtroomSession
from app.models.document import Document
from app.models.management import ManagementAudit, ManagementRecord, WorkspaceAccess
from app.models.user import User

POSITIONS = ('lawyer', 'trainee', 'secretary', 'accountant', 'consultant', 'client')


def seed_record_keys():
    keys = ['leave', 'trash']
    for i in range(6):
        keys += [f'{kind}:{i}' for kind in ('time','client','communication','deadline','checklist','approval')]
        keys += [f'finance:{i}:{kind}' for kind in ('fee','payment','expense','reimbursement','advance','advance_spend')]
    keys += [f'lead:{stage}' for stage in ('new','meeting','evaluation','offer','contract','documents')]
    keys += [f'publication:{status}' for status in ('draft','published')]
    keys += [f'support:{status}' for status in ('open','in_progress','resolved')]
    return keys


def removal_plan(db, admin):
    firm = admin.law_firm_id
    tables = Base.metadata.tables
    selected = {}

    def add(table, ids):
        selected.setdefault(table, set()).update(ids)

    cases = sample_cases(db, firm)
    cases += db.query(Case).filter(Case.law_firm_id == firm, Case.case_number.in_([f'ÖRNEK-EMSAL-{i}' for i in range(1,4)]), Case.description.startswith('[ÖRNEK ŞABLON] '), Case.is_precedent.is_(True)).all()
    case_ids = {c.id for c in cases}
    from app.db.dossier_pack import removable_dossiers
    removable, protected = removable_dossiers(db, firm)
    case_ids.update(removable)
    add('cases', case_ids)
    keys = seed_record_keys()
    records = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == firm, ManagementRecord.id.in_([identity(firm, 'record:'+key) for key in keys])).all()
    # An example subsequently adopted by a non-template case is no longer removed.
    add('management_records', [r.id for r in records if r.case_id is None or r.case_id in case_ids])
    add('management_audits', [r.id for r in db.query(ManagementAudit).filter(ManagementAudit.law_firm_id == firm, ManagementAudit.id.in_([identity(firm,'audit:'+key) for key in keys]+[identity(firm,'archive-initialized'), identity(firm,'team-distribution:v1')])).all()])
    user_ids = [row.id for row in db.query(User).filter_by(law_firm_id=firm).all()]
    chats = [identity(firm,f'chat:{uid}:{i}') for uid in user_ids for i in range(3)]
    chat_table = tables['chat_conversations']
    add('chat_conversations', db.execute(select(chat_table.c.id).where(chat_table.c.law_firm_id == firm,chat_table.c.id.in_(chats))).scalars())
    personal = [identity(firm,f'personal-court:{uid}:{active}') for uid in user_ids for active in (False,True)]
    sessions = db.query(CourtroomSession).filter(CourtroomSession.law_firm_id == firm, or_(CourtroomSession.id.in_(personal), (CourtroomSession.prompt_version == 'showcase-v1') & (CourtroomSession.model == 'scripted-training-example'))).all()
    add('courtroom_sessions', [s.id for s in sessions])
    transfer_table = tables['work_transfers']
    add('work_transfers', db.execute(select(transfer_table.c.id).where(transfer_table.c.law_firm_id == firm,transfer_table.c.id == identity(firm,'transfer'))).scalars())
    # Preserve a scenario adopted by any non-template rehearsal, detaching its source later.
    scenarios = db.query(CourtroomScenario).filter(CourtroomScenario.law_firm_id == firm,CourtroomScenario.source_case_id.in_(case_ids)).all() if case_ids else []
    for scenario in scenarios:
        attached = db.query(CourtroomSession).filter_by(scenario_id=scenario.id).all()
        if all(s.id in selected['courtroom_sessions'] for s in attached):
            add('courtroom_scenarios', [scenario.id])

    changed = True
    while changed:
        changed = False
        for table in Base.metadata.sorted_tables:
            if 'id' not in table.c:
                continue
            clauses = []
            for fk in table.foreign_keys:
                parent = fk.column.table.name
                if fk.parent.name == 'source_case_id':
                    continue
                if selected.get(parent):
                    clauses.append(table.c[fk.parent.name].in_(selected[parent]))
            if not clauses:
                continue
            query = select(table.c.id).where(or_(*clauses))
            if 'law_firm_id' in table.c:
                query = query.where(table.c.law_firm_id == firm)
            found = set(db.execute(query).scalars())
            before = len(selected.get(table.name, set()))
            add(table.name, found)
            changed |= len(selected[table.name]) != before

    sample_ids = roster_ids(firm) | {identity(firm, 'member:'+p) for p in POSITIONS}
    removed_users, kept_users = set(), set()
    expected = {identity(firm,f'team-lawyer:{i}'):(f'ÖRNEK · {name}',f"sample-{identity(firm, f'team-email:{i}')}@example.invalid") for i,(name,_) in enumerate(DEMO_LAWYERS)}
    names = ('Deniz Kaya','Ece Yalın','Selin Akın','Can Erdem','Arda Ekin','Ada Örnek Müvekkil')
    expected.update({identity(firm,'member:'+position):(f'ÖRNEK · {name}',f'ornek-{identity(firm,position)}@example.com') for position,name in zip(POSITIONS,names)})
    for user in db.query(User).filter(User.law_firm_id == firm, User.id.in_(sample_ids)).all():
        grant = db.query(WorkspaceAccess).filter_by(law_firm_id=firm,user_id=user.id).first()
        referenced = bool(grant and any(cid not in case_ids for cid in grant.case_ids))
        for table in Base.metadata.sorted_tables:
            if table.name == 'workspace_access':
                continue
            for fk in table.foreign_keys:
                if fk.column.table.name != 'users':
                    continue
                query = select(table.c[fk.parent.name]).where(table.c[fk.parent.name] == user.id)
                if selected.get(table.name) and 'id' in table.c:
                    query = query.where(table.c.id.notin_(selected[table.name]))
                if db.execute(query.limit(1)).first():
                    referenced = True
        original_password_stamp = user.password_set_at is not None and abs((user.password_set_at.replace(tzinfo=None)-user.created_at.replace(tzinfo=None)).total_seconds()) <= 2
        unchanged = (user.full_name,user.email) == expected.get(user.id) and user.invited_at is None and original_password_stamp
        if referenced or not unchanged or user.role.value != 'lawyer' or user.is_platform_admin:
            kept_users.add(user.id)
        else:
            removed_users.add(user.id)
    add('users', removed_users)
    access = db.query(WorkspaceAccess).filter(WorkspaceAccess.law_firm_id == firm,WorkspaceAccess.user_id.in_(removed_users)).all()
    add('workspace_access', [r.id for r in access])
    fingerprint = json.dumps({k:sorted(v) for k,v in selected.items()},sort_keys=True)+json.dumps(sorted(kept_users))
    counts = {'Davalar ve emsaller':len(case_ids), 'Örnek kullanıcılar':len(removed_users), 'Büro iş akışları':len(selected.get('management_records',[])), 'Belgeler':len(selected.get('documents',[])), 'Sohbetler':len(selected.get('chat_conversations',[])), 'Duruşma provaları':len(selected.get('courtroom_sessions',[]))}
    if protected:
        counts['Kullanıcı içeriği nedeniyle korunan dava dosyaları'] = len(protected)
    return selected, {'token':hashlib.sha256(fingerprint.encode()).hexdigest(),'counts':counts,'kept_users':len(kept_users),'total_records':sum(map(len, selected.values()))}


def remove_template(db, admin, selected):
    firm = admin.law_firm_id
    case_ids = selected.get('cases', set())
    files = [doc.storage_path for doc in db.query(Document).filter(Document.law_firm_id == firm,Document.id.in_(selected.get('documents',set()))).all()]
    for grant in db.query(WorkspaceAccess).filter_by(law_firm_id=firm).all():
        if grant.id not in selected.get('workspace_access',set()):
            grant.case_ids = [cid for cid in grant.case_ids if cid not in case_ids]
    if case_ids:
        db.query(CourtroomScenario).filter(CourtroomScenario.law_firm_id == firm,CourtroomScenario.source_case_id.in_(case_ids)).update({CourtroomScenario.source_case_id:None},synchronize_session=False)
    db.flush()
    for table in reversed(Base.metadata.sorted_tables):
        if selected.get(table.name):
            query = table.delete().where(table.c.id.in_(selected[table.name]))
            if 'law_firm_id' in table.c:
                query = query.where(table.c.law_firm_id == firm)
            db.execute(query)
    db.flush()
    db.expire_all()
    return files


def unlink_removed_files(db, files):
    """Run only after commit; never delete outside protected storage or shared files."""
    from app.core.config import settings
    root = Path(settings.storage_dir).resolve()
    for value in set(files):
        if not value or value.startswith('demo://'):
            continue
        path = Path(value)
        if not path.resolve().is_relative_to(root) or any(Path(doc.storage_path).resolve() == path.resolve() for doc in db.query(Document).all() if doc.storage_path and not doc.storage_path.startswith('demo://')):
            continue
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
