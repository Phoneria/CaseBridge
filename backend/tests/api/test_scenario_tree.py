from datetime import date, datetime, timedelta, timezone
import pytest
from app.models.case import Case, CaseEvent, CaseType
from app.models.document import Document, DocumentType
from app.models.management import WorkspaceAccess
from app.models.simulation import AIAnalysis, AnalysisType, AssessmentConfidence, Simulation, SimulationStatus

@pytest.fixture()
def data(db_session, office, auth_headers):
    a=Case(law_firm_id=office.firm_a.id,case_number='TREE-A',case_name='Sentetik alacak',client_name='Örnek A',case_type=CaseType.DIGER,facts_summary='Ödeme kaydı ve teslim tarihi doğrulanacak.',claim='Ödenmeyen bedel')
    b=Case(law_firm_id=office.firm_b.id,case_number='TREE-B',case_name='Diğer büro özel dosyası',client_name='Örnek B',case_type=CaseType.DIGER)
    db_session.add_all([a,b]);db_session.commit()
    return dict(a=a,b=b,firm=office.firm_a.id,other=office.firm_b.id,headers=auth_headers(office.lawyer_a1),user=office.lawyer_a1)

def analysis(db,d,*,status=SimulationStatus.COMPLETED,firm=None,scenarios=None,created=None,kind=AnalysisType.SIMULATION_REPORT):
    scope=firm or d['firm'];sim=Simulation(case_id=d['a'].id,law_firm_id=scope,status=status,provider='test',completed_at=created);db.add(sim);db.flush()
    row=AIAnalysis(case_id=d['a'].id,law_firm_id=scope,simulation_id=sim.id,analysis_type=kind,summary='Doğrulanması gereken örnek değerlendirme',possible_scenarios=scenarios or ['Belge doğrulanırsa iddia desteklenebilir.','Karşı delil değerlendirmeyi değiştirebilir.'],assessment_score=100,assessment_confidence=AssessmentConfidence.HIGH,ai_disclaimer='Kurgusal örnek; sonuç garantisi değildir.',missing_information=['Belgenin aslı eksik.'],opposing_arguments=['Teslim tarihi tartışmalı.'],questions=['Ödeme hangi borca ilişkin?'],created_at=created or datetime.now(timezone.utc))
    db.add(row);db.commit();return row

def url(d):return f"/legal-lab/cases/{d['a'].id}/scenario-tree"

def test_auth_scope(client,data):
    d=data
    assert client.get(url(d)).status_code==401
    for id in [d['b'].id,'missing']:assert client.get(f'/legal-lab/cases/{id}/scenario-tree',headers=d['headers']).status_code==404
    r=client.get(url(d)+'?law_firm_id='+d['other'],headers=d['headers']);assert r.status_code==200 and r.json()['case_id']==d['a'].id

def test_restricted_workspace(client,db_session,data):
    d=data;db_session.add(WorkspaceAccess(user_id=d['user'].id,law_firm_id=d['firm'],position='client',case_ids=[d['a'].id]));db_session.commit()
    assert client.get(url(d),headers=d['headers']).status_code==403

def test_fallback_is_conditional_not_calculated(client,data):
    r=client.get(url(data),headers=data['headers']);assert r.status_code==200;tree=r.json()
    assert tree['source_mode']=='conditional_preparation'
    assert len([n for n in tree['nodes'] if n['kind']=='development'])>=2
    assert all(n['probability'] is None and n['reasoning'] and n['uncertainties'] for n in tree['nodes'])
    assert all(n['support_weight']==50 and n['assessment_label']=='Demo tahmini' for n in tree['nodes'] if n['kind']=='development')
    assert tree['current_facts'] and 'kazanma' in tree['disclaimer'].lower()

def test_latest_completed_analysis_and_no_score_conversion(client,db_session,data):
    d=data;now=datetime.now(timezone.utc)
    analysis(db_session,d,created=now-timedelta(days=2),scenarios=['Eski kayıt']);latest=analysis(db_session,d,created=now-timedelta(days=1))
    analysis(db_session,d,status=SimulationStatus.PENDING,created=now);analysis(db_session,d,kind=AnalysisType.CASE_SUMMARY,created=now+timedelta(seconds=1))
    tree=client.get(url(d),headers=d['headers']).json()
    assert tree['analysis_id']==latest.id and tree['source_mode']=='stored_analysis'
    assert [n['label'] for n in tree['nodes'] if n['kind']=='scenario']==latest.possible_scenarios
    assert all(n['probability'] is None for n in tree['nodes'])
    assert 'Belgenin aslı eksik.' in tree['uncertainties']
    assert len({n['id'] for n in tree['nodes']})==len(tree['nodes'])
    assert all(sid in {s['id'] for s in tree['sources']} for n in tree['nodes'] for sid in n['source_ids'])

def test_malformed_cross_firm_children_excluded(client,db_session,data):
    d=data
    db_session.add(CaseEvent(case_id=d['a'].id,law_firm_id=d['other'],title='DİĞER BÜRO GİZLİ OLAY',event_date=date.today()))
    db_session.add(Document(case_id=d['a'].id,law_firm_id=d['other'],filename='DİĞER BÜRO BELGE',file_type=DocumentType.TXT,storage_path='/private/secret',extracted_text='DİĞER BÜRO METNİ'))
    analysis(db_session,d,firm=d['other'],scenarios=['DİĞER BÜRO ANALİZİ']);db_session.commit()
    r=client.get(url(d),headers=d['headers']);assert r.status_code==200
    assert 'DİĞER BÜRO' not in r.text and 'storage_path' not in r.text and '/private/' not in r.text

def test_version_tracks_content_without_document_text(client,db_session,data):
    d=data;doc=Document(case_id=d['a'].id,law_firm_id=d['firm'],filename='Örnek belge.txt',file_type=DocumentType.TXT,storage_path='/private/example',extracted_text='ÖZEL BELGE İÇERİĞİ')
    event=CaseEvent(case_id=d['a'].id,law_firm_id=d['firm'],title='Örnek gelişme',event_date=date.today(),description='İlk bilgi')
    db_session.add_all([doc,event]);db_session.commit();first=client.get(url(d),headers=d['headers']);assert first.status_code==200 and 'ÖZEL BELGE İÇERİĞİ' not in first.text
    assert first.json()['context_version']==client.get(url(d),headers=d['headers']).json()['context_version']
    event.description='Düzeltilmiş bilgi';db_session.commit();second=client.get(url(d),headers=d['headers']).json()['context_version'];assert second!=first.json()['context_version']
    doc.extracted_text='Değişen içerik';db_session.commit();assert client.get(url(d),headers=d['headers']).json()['context_version']!=second

def test_platform_admin_forbidden(client,db_session,data):
    d=data;d['user'].is_platform_admin=True;db_session.commit()
    assert client.get(url(d),headers=d['headers']).status_code==403

def test_closed_example_and_malformed_optional_analysis_fields(client,db_session,data):
    from app.models.case import CaseStatus
    d=data;d['a'].status=CaseStatus.KAPALI;row=analysis(db_session,d)
    row.missing_information={'malformed':'not a list'};row.opposing_arguments='not a list'
    sim=db_session.get(Simulation,row.simulation_id);sim.provider='demo-template';db_session.commit()
    response=client.get(url(d),headers=d['headers']);assert response.status_code==200
    assert response.json()['case_closed'] and response.json()['is_example']
    assert 'not a list' not in response.text

def test_bounded_history_and_scenarios_are_explicit(client,db_session,data):
    d=data
    for i in range(61):
        db_session.add(CaseEvent(case_id=d['a'].id,law_firm_id=d['firm'],title=f'Kurgusal gelişme {i}',event_date=date.today()))
        db_session.add(Document(case_id=d['a'].id,law_firm_id=d['firm'],filename=f'Örnek {i}.txt',file_type=DocumentType.TXT,storage_path='/synthetic',extracted_text='yalnız sentetik'))
    analysis(db_session,d,scenarios=[f'Koşullu senaryo {i}' for i in range(7)])
    response=client.get(url(d),headers=d['headers']);assert response.status_code==200;tree=response.json()
    assert tree['truncated'] and len(tree['nodes'])==19
    assert len([s for s in tree['sources'] if s['kind']=='event'])==60
    assert len([s for s in tree['sources'] if s['kind']=='document'])==60
    assert len(tree['sources'])<=144 and len(tree['current_facts'])<=80


def test_case_support_assumptions_scope_determinism_and_empty(client, db_session, data):
    d=data
    before=client.get(url(d),headers=d['headers']).json()
    empty=client.get(url(d),headers=d['headers'],params={'assumptions':'{"confirm":"supports"}'}).json()
    assert next(n for n in empty['nodes'] if n['id']=='confirm')['support_weight']==50
    assert empty['context_version'] != before['context_version']
    analysis(db_session,d)
    counts={model:db_session.query(model).count() for model in [Case, CaseEvent, Document, Simulation, AIAnalysis]}
    for assumption, expected in [('neutral',50),('supports',62),('contradicts',38)]:
        params={'assumptions':'{"scenario-0":"'+assumption+'"}'}
        response=client.get(url(d),headers=d['headers'],params=params)
        assert response.status_code==200
        tree=response.json()
        assert next(n for n in tree['nodes'] if n['id']=='scenario-0')['support_weight']==expected
        assert next(n for n in tree['nodes'] if n['id']=='scenario-1')['support_weight']==50
        assert tree['context_version']==client.get(url(d),headers=d['headers'],params=params).json()['context_version']
        assert all(n['probability'] is None for n in tree['nodes'])
    assert counts=={model:db_session.query(model).count() for model in counts}
    for value in ['null','[]','{','{"root":"supports"}','{"scenario-0":"forged"}','{"scenario-0":{}}','x'*2001]:
        assert client.get(url(d),headers=d['headers'],params={'assumptions':value}).status_code==422
    assert client.get(f"/legal-lab/cases/{d['b'].id}/scenario-tree",headers=d['headers'],params={'assumptions':'{"scenario-0":"supports"}'}).status_code==404


def test_demo_combinations_and_arithmetic(client,data):
    from app.legal_lab.scenario_demo import build_demo, percentage_tenths
    from app.legal_lab.scenario_tree import ScenarioTree
    from pydantic import ValidationError
    assert percentage_tenths([1,1,1])==[334,333,333]
    for doc in ['unreviewed','supports','contradicts','missing']:
        for payment in ['unknown','supports','contradicts','missing']:
            tree=build_demo(doc,payment)
            assert tree.context_version==build_demo(doc,payment).context_version
            weights=tree.demo.groups[0].weights
            assert sum(w.percentage_tenths for w in weights)==1000
            assert all(n.assessment_label=='Demo tahmini' and n.probability is not None for n in tree.nodes if n.kind=='scenario')
            if 'missing' in [doc,payment]:
                assert [w.percentage_tenths for w in weights]==[334,333,333]
                assert tree.demo.missing_reason
    supportive=build_demo('supports','supports'); contrary=build_demo('contradicts','contradicts')
    assert supportive.nodes[1].probability>contrary.nodes[1].probability
    payload=supportive.model_dump();payload['case_id']=data['a'].id
    with pytest.raises(ValidationError):ScenarioTree.model_validate(payload)
    payload=supportive.model_dump();payload['nodes'][1]['probability']=float('nan')
    with pytest.raises(ValidationError):ScenarioTree.model_validate(payload)
    endpoint='/legal-lab/scenario-demo'
    assert client.get(endpoint).status_code==401
    assert client.get(endpoint,headers=data['headers']).status_code==200
    assert client.get(endpoint,headers=data['headers'],params={'document':'forged'}).status_code==422


def test_real_schema_rejects_probability_and_tampered_support(client,data):
    from app.legal_lab.scenario_tree import ScenarioTree
    from pydantic import ValidationError
    tree=client.get(url(data),headers=data['headers']).json()
    for key,value in [('probability',0.5),('support_weight',99)]:
        payload=__import__('copy').deepcopy(tree);payload['nodes'][1][key]=value
        with pytest.raises(ValidationError):ScenarioTree.model_validate(payload)
