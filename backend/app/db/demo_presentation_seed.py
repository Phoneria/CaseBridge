"""Connected, explicitly fictional presentation records for one bureau.

No provider calls, outgoing invitations, shared passwords or real record edits.
Stable tenant-bound IDs let older installations fill gaps without duplicating data.
"""
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import local_today
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseOutcome, CaseStatus
from app.models.chat import ChatConversation, ChatMessage, ChatMessageStatus, ChatRole
from app.models.document import Document
from app.models.management import FirmProfile, ManagementAudit, ManagementRecord, WorkspaceAccess, WorkTransfer
from app.models.simulation import AIAnalysis, AnalysisType, AssessmentConfidence, Simulation, SimulationStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.management import RecordWrite

LABEL = "ÖRNEK · "
DISCLAIMER = "Kurgusal gösterim verisidir. Gerçek belge, AI sağlayıcı çıktısı veya hukuki görüş değildir."


def identity(firm_id: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"casebridge/presentation-v1/{firm_id}/{key}"))


def put(db, row_class, firm_id, key, **values):
    row_id = identity(firm_id, key)
    row = db.get(row_class, row_id)
    if row is None:
        row = row_class(id=row_id, **values)
        db.add(row)
        db.flush()
    return row


def enrich_cases(db, admin, cases):
    """Backfill only missing fields of the explicitly marked sample portfolio."""
    today = local_today()
    for index, case in enumerate(cases):
        fields = {
            "client_role": "plaintiff", "court_file_number": f"{today.year}/{200 + index} E.",
            "claim": f"{case.client_name} adına {case.case_name.lower()} kapsamındaki talebin değerlendirilmesi.",
            "facts_summary": f"{DISCLAIMER} {case.description.removeprefix('[ÖRNEK ŞABLON] ')} Tarafların sözleşmesi, yazışmaları ve ödeme kayıtları birlikte incelenecek.",
            "plaintiff_position": "Sözleşmedeki edimin yerine getirilmediği, ihtara rağmen uyuşmazlığın giderilmediği ileri sürülüyor.",
            "defendant_position": "İfa ve ödeme kayıtlarının talebi karşılamadığı; bazı iddiaların ek delille kanıtlanması gerektiği savunuluyor.",
        }
        if case.status == CaseStatus.KAPALI:
            fields.update(decision_date=case.opening_date + timedelta(days=90), closing_note=LABEL + "Gösterim amaçlı sonuç kaydı; kesinleşme ve tahsilat takibi örneklendirilmiştir.")
        for field, value in fields.items():
            if not getattr(case, field):
                setattr(case, field, value)
        for party in case.parties:
            if not party.counsel_name:
                party.counsel_name = "Örnek dosya vekili"
        if case.status != CaseStatus.KAPALI and (not case.next_hearing_date or case.next_hearing_date < today):
            from app.services.hearing_dates import ensure_all_day_hearing, recompute_next_hearing
            ensure_all_day_hearing(db, case, today+timedelta(days=index%6+2), admin.id)
            recompute_next_hearing(db, case, today)
        for task in db.query(Task).filter_by(case_id=case.id,law_firm_id=admin.law_firm_id).all():
            task.reminder_days=[]
        for event in db.query(CalendarEvent).filter_by(case_id=case.id,law_firm_id=admin.law_firm_id).all():
            event.reminder_days=[]
        # Legacy seeds had demo:// documents which could be read but not downloaded.
        for document in db.query(Document).filter_by(case_id=case.id, law_firm_id=admin.law_firm_id).all():
            if document.storage_path.startswith("demo://"):
                destination = Path(settings.storage_dir) / admin.law_firm_id / case.id / f"sample_{document.id}.txt"
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(f"{DISCLAIMER}\n\n{document.extracted_text or document.filename}", encoding="utf-8")
                document.storage_path = str(destination)
    # One closed sample demonstrates the archive without moving any real record.
    archived_case = next((c for c in reversed(cases) if c.status == CaseStatus.KAPALI), None)
    if archived_case and db.get(ManagementAudit, identity(admin.law_firm_id, "archive-initialized")) is None:
        archived_case.is_archived = True
        put(db, ManagementAudit, admin.law_firm_id, "archive-initialized", law_firm_id=admin.law_firm_id,
            actor_id=admin.id, action="demo.archive_created", entity_type="case", entity_id=archived_case.id,
            reason="Kapalı kurgusal dava ile arşiv görünümü örneklendirildi.")
    # Deliberately fictional precedent illustrations, isolated from case statistics.
    from app.db.seed import _get_or_create_case, _get_or_create_demo_note
    for index, source in enumerate([c for c in cases if c.status == CaseStatus.KAPALI][:3]):
        precedent = _get_or_create_case(
            db, admin.law_firm, admin, case_number=f"ÖRNEK-EMSAL-{index+1}",
            case_name=LABEL + source.case_name + " · emsal inceleme örneği",
            client_name="Anonim örnek taraf A", opposing_party="Anonim örnek taraf B",
            case_type=source.case_type, court="Kurgusal karar inceleme örneği",
            is_precedent=True, is_archived=True, status=CaseStatus.KAPALI,
            outcome=source.outcome, opening_date=today-timedelta(days=45+index*30),
            decision_date=today-timedelta(days=15+index*30),
            description="[ÖRNEK ŞABLON] " + DISCLAIMER,
            claim="Delil değerlendirmesinin ve ispat yükünün karşılaştırmalı incelenmesi.",
            facts_summary=DISCLAIMER, plaintiff_position="İfanın ispatı ve sözleşmeye aykırılık iddiası.",
            defendant_position="Ödeme ve ifa itirazlarının değerlendirilmesi.", client_role="plaintiff",
            court_file_number=f"GÖSTERİM-{index+1}", closing_note=DISCLAIMER,
        )
        _get_or_create_demo_note(db, precedent, admin, "ornek-karar-incelemesi.txt", f"{DISCLAIMER}\n{source.case_name}\nİspat yükü, delil tutarlılığı ve itirazların karşılaştırılması. Bu metne gerçek emsal olarak atıf yapılamaz.")
    db.flush()


def seed_operations(db: Session, admin: User, cases: list[Case]):
    now = datetime.now(timezone.utc)
    today = local_today()
    firm_id = admin.law_firm_id
    # Random placeholder digests have no known password. No invitation/token is issued.
    # The example identities never receive real customer case assignments or access.
    from app.services.auth_service import DUMMY_PASSWORD_HASH
    members = []
    for position, name in [("lawyer", "Deniz Kaya"), ("trainee", "Ece Yalın"), ("secretary", "Selin Akın"), ("accountant", "Can Erdem"), ("consultant", "Arda Ekin"), ("client", "Ada Örnek Müvekkil")]:
        user = put(db, User, firm_id, f"member:{position}", law_firm_id=firm_id,
                   email=f"ornek-{identity(firm_id, position)}@example.com", full_name=LABEL+name,
                   role=UserRole.LAWYER, department="Kurgusal gösterim ekibi", hashed_password=DUMMY_PASSWORD_HASH)
        members.append(user)
        if db.query(WorkspaceAccess).filter_by(user_id=user.id).first() is None:
            put(db, WorkspaceAccess, firm_id, f"grant:{position}", law_firm_id=firm_id, user_id=user.id,
                position=position, case_ids=[c.id for c in (cases if position == "lawyer" else cases[:3])])
    lawyer, trainee, secretary, accountant, consultant, client_user = members
    open_cases = [c for c in cases if c.status != CaseStatus.KAPALI and not c.is_archived]
    primary = open_cases[0]

    def record(key, kind, title, data, *, status=None, case=None, owner=None, due=None, deleted=False):
        from app.schemas.management import STATES
        payload = RecordWrite(kind=kind, title=LABEL+title, status=status or STATES[kind][0], case_id=case.id if case else None,
                              owner_id=(owner or admin).id, due_date=due, data=data)
        row = put(db, ManagementRecord, firm_id, f"record:{key}", law_firm_id=firm_id,
                  created_by=admin.id, **payload.model_dump(exclude={"version"}), deleted_at=now if deleted else None)
        # Loading for a later presentation refreshes sample dates, not user text/state.
        row.due_date = due
        dated_keys = {"entry_date", "work_date", "contact_date", "next_contact_date", "starts_on", "ends_on", "appointment"}
        row.data = {**row.data, **{k:v for k,v in payload.data.items() if k in dated_keys}}
        audit_id = identity(firm_id, f"audit:{key}")
        if db.get(ManagementAudit, audit_id) is None:
            put(db, ManagementAudit, firm_id, f"audit:{key}", law_firm_id=firm_id, actor_id=admin.id,
                action="demo.record_created", entity_type=kind, entity_id=row.id, reason="Kurgusal gösterim şablonu yüklendi.", after={"title": row.title})
        return row

    for index, owner in enumerate([lawyer,trainee,secretary]):
        put(db,Task,firm_id,f"team-task:{index}",law_firm_id=firm_id,case_id=primary.id,assigned_to=owner.id,created_by=admin.id,
            title=LABEL+["Delil klasörünü tamamla","İçtihat karşılaştırma notunu hazırla","Müvekkil görüşmesini planla"][index],description=DISCLAIMER,
            due_date=today+timedelta(days=index-1),status=TaskStatus.PENDING,reminder_days=[])
    for index, case in enumerate(open_cases[:6]):
        for entry_type, amount in [("fee", 90000+index*15000), ("payment", 30000+index*5000), ("expense", 3500), ("reimbursement", 1500), ("advance", 10000), ("advance_spend", 2000)]:
            record(f"finance:{index}:{entry_type}", "finance", f"{case.case_name} · {entry_type}", {"entry_type":entry_type,"amount":str(amount),"currency":"TRY","entry_date":str(today-timedelta(days=10-index)),"note":DISCLAIMER},case=case,owner=accountant)
        record(f"time:{index}", "time", case.case_name+" · dosya çalışması", {"work_date":str(today-timedelta(days=index)),"minutes":90+index*30,"hourly_cost":"1800","currency":"TRY","note":"Belge inceleme, görüşme ve duruşma hazırlığı. "+DISCLAIMER},case=case,owner=lawyer)
        customer=record(f"client:{index}", "client", case.client_name, {"case_ids":[case.id],"email":f"ornek-muvekkil-{index}@example.com","phone":"Örnek iletişim kaydı","company":case.client_name,"contact_date":str(today-timedelta(days=2)),"next_contact_date":str(today+timedelta(days=3)),"note":DISCLAIMER},case=case,owner=secretary)
        record(f"communication:{index}", "communication", "Müvekkil hazırlık görüşmesi", {"client_id":customer.id,"contact_date":str(today-timedelta(days=2)),"channel":"meeting","promise":"Eksik belgeler üç iş günü içinde paylaşılacak.","note":"Duruşma takvimi ve tahsilat planı konuşuldu. "+DISCLAIMER},case=case,owner=secretary)
        record(f"deadline:{index}","deadline",case.case_name+" · beyan süresi",{"source":"Örnek ara karar / tebliğ kaydı","backup_id":lawyer.id,"verified":index%2==0,"reminder_days":[],"note":DISCLAIMER},case=case,owner=admin,due=today+timedelta(days=index-1))
        record(f"checklist:{index}","checklist",case.case_name+" · hazırlık kontrolü",{"template":"hearing","items":[{"title":"Dosya ve taraf bilgilerini kontrol et","done":True},{"title":"Delil klasörünü hazırla","done":False,"depends_on":0},{"title":"Duruşma notunu gözden geçir","done":False,"depends_on":1}],"note":DISCLAIMER},case=case,owner=lawyer,due=today+timedelta(days=index+2))
        document=db.query(Document).filter_by(case_id=case.id).first()
        record(f"approval:{index}","approval",case.case_name+" · beyan taslağı",{"document_id":document.id,"revision":index+1,"content":"Uyuşmazlık özeti, deliller ve taleplerin yer aldığı kurgusal taslak. "+DISCLAIMER,"review_note":"Eklerin sırası ve talep sonucu kontrol edilecek."},status=["draft","review","changes","approved"][index%4],case=case,owner=lawyer,due=today+timedelta(days=2))
    for index, stage in enumerate(["new","meeting","evaluation","offer","contract","documents"]):
        record(f"lead:{stage}","lead",f"Yeni müvekkil görüşmesi {index+1}",{"client_name":f"Örnek Şirket {index+1}","opposing_party":"Kurgusal Karşı Taraf","email":f"ornek-aday-{index}@example.com","waiting_reason":"Sözleşme ve belgelerin değerlendirilmesi bekleniyor.","conflict_decision":"clear" if index>2 else "pending","conflict_reason":"Yalnızca kurgusal taraflarla gösterim kontrolü." if index>2 else "","note":DISCLAIMER},status=stage,owner=secretary,due=today+timedelta(days=index+1))
    record("leave","leave","İzin ve yedek sorumlu planı",{"starts_on":str(today+timedelta(days=7)),"ends_on":str(today+timedelta(days=10)),"backup_id":admin.id,"note":DISCLAIMER},status="requested",owner=lawyer,due=today+timedelta(days=7))
    doc=db.query(Document).filter_by(case_id=primary.id).first()
    for status in ["draft","published"]:
        record(f"publication:{status}","publication",f"Müvekkil durum özeti · {status}",{"audience_ids":[client_user.id],"document_ids":[doc.id],"message":"Duruşma hazırlığı sürüyor; delil listesi tamamlandı. "+DISCLAIMER,"request":"İmzalı sözleşme ekini yüklemeniz bekleniyor.","appointment":str(today+timedelta(days=5)),"financial_summary":"Örnek ücret 90.000 TL; örnek tahsilat 30.000 TL."},status=status,case=primary,owner=admin)
    for index,state in enumerate(["open","in_progress","resolved"]):
        record(f"support:{state}","support",["Gösterim hazırlığı kontrolü","Örnek belge yükleme takibi","Tamamlanan kurulum görüşmesi"][index],{"priority":["high","normal","low"][index],"contact_name":admin.full_name,"note":DISCLAIMER},status=state,owner=admin,due=today+timedelta(days=index+1))
    record("trash","support","İptal edilmiş gösterim kaydı",{"priority":"low","contact_name":"Örnek ekip","note":DISCLAIMER},deleted=True)
    for i,event_type in enumerate([CalendarEventType.MEETING,CalendarEventType.CLIENT_MEETING,CalendarEventType.OTHER]):
        event=put(db,CalendarEvent,firm_id,f"calendar:{i}",law_firm_id=firm_id,title=LABEL+["Dosya strateji toplantısı","Müvekkil hazırlık görüşmesi","Ekip belge kontrolü"][i],event_type=event_type,starts_at=datetime.combine(today+timedelta(days=i),time(11+i,0)),duration_minutes=45,location="Örnek toplantı odası / çevrim içi",notes=DISCLAIMER,case_id=primary.id,assignee_id=admin.id,created_by=admin.id,reminder_days=[])
        event.starts_at=datetime.combine(today+timedelta(days=i),time(11+i,0))
    put(db,WorkTransfer,firm_id,"transfer",law_firm_id=firm_id,from_user_id=admin.id,to_user_id=lawyer.id,created_by=admin.id,reason="Kurgusal devir geçmişi; gerçek dosya devredilmedi.",counts={"cases":0,"tasks":0,"events":0,"records":0},accepted_at=now)
    profile=db.get(FirmProfile,firm_id)
    if profile is None:
        profile=FirmProfile(law_firm_id=firm_id,data={})
        db.add(profile)
    # Never change a real firm's billing/contact or existing budget configuration.
    if "ai_budget" not in profile.data:
        profile.data={**profile.data,"ai_budget":{"token_budget":250000,"cost_per_million":"2.50","currency":"USD"}}
    db.flush()
    return members


def seed_ai_history(db, admin, cases):
    from app.ai.schemas import AIAnalysisResult
    from app.models.courtroom import CourtroomSession, CourtroomSessionStatus, CourtroomActor, CourtroomPhase, CourtroomRole, CourtroomTurn, CourtroomTurnType, JudgeEvaluation
    from app.services.case_courtroom import scenario_from_case
    firm_id = admin.law_firm_id
    now = datetime.now(timezone.utc)
    for index, case in enumerate(cases):
        report = AIAnalysisResult(
            summary=f"{DISCLAIMER}\n{case.case_name}: {case.client_name} ile {case.opposing_party} arasındaki uyuşmazlıkta sözleşme, ödeme ve bildirim kayıtları birlikte incelenir. Öncelik, iddia edilen olayları tarihlendirmek ve karşı tarafın itirazlarını belge bazında yanıtlamaktır.",
            strong_points=["Dosyadaki kronoloji ve talep sonucu birlikte izlenebiliyor.","Sözleşme ve yazışmaların karşılaştırılması için belge listesi hazır."],
            weak_points=["Tebliğ ve ödeme belgelerinin asılları ayrıca doğrulanmalı.","Zarar hesabının dönemi ve yöntemi açıklığa kavuşturulmalı."],
            opposing_arguments=["İfa veya ödemenin farklı bir ilişkiye ait olduğu ileri sürülebilir.","Delillerin bütünlüğü ve bildirim süreleri tartışılabilir."],
            missing_information=["İmzalı sözleşme ekleri", "Ödeme hareketlerinin tam dökümü", "Bildirim ve tebliğ tarihlerinin doğrulanması"],
            possible_scenarios=["Belgeler doğrulandığında talebin daha güçlü desteklenmesi.","Eksik kayıtların sonucu değiştirmesi veya ek inceleme gerekmesi.","Tarafların maliyet ve süreyi değerlendirerek uzlaşması."],
            questions=["Her ödeme hangi borca mahsup edildi?", "Bildirim karşı tarafa hangi tarihte ulaştı?"],
            recommended_actions=["Belge-tarih-talep eşleştirme tablosunu tamamlayın.","Karşı savunmayı her delil için ayrı yanıtlayın.","Duruşma öncesi eksik delil ve süre kontrolünü bitirin."],
            assessment={"score":62+index%5*4,"confidence":"low"},ai_disclaimer=DISCLAIMER,requires_verification=True,
        )
        sim = put(db,Simulation,firm_id,f"analysis:{case.id}",law_firm_id=firm_id,case_id=case.id,
                  requested_by=admin.id,status=SimulationStatus.COMPLETED,provider="demo-template",model="fictional-presentation",
                  prompt_version="demo-v1",context_version="demo-v1",started_at=now-timedelta(hours=index+1),completed_at=now-timedelta(hours=index+1),
                  duration_ms=1200,prompt_tokens=1800,completion_tokens=900,total_tokens=2700)
        data=report.model_dump(exclude={"assessment"})
        put(db,AIAnalysis,firm_id,f"report:{case.id}",law_firm_id=firm_id,case_id=case.id,simulation_id=sim.id,
            analysis_type=AnalysisType.SIMULATION_REPORT,assessment_score=report.assessment.score,
            assessment_confidence=AssessmentConfidence.LOW,created_at=now-timedelta(hours=index+1),**data)
    for i,(title,question,answer) in enumerate([
        ("Duruşma hazırlık planı","Örnek dosyada duruşma hazırlığını nasıl sıralayalım?","Önce talep ve savunmayı özetleyin. Ardından her iddiayı belgeyle eşleştirin; eksik asılları ve tebliğ tarihlerini ayırın. Son olarak karşı tarafın üç temel itirazına kısa cevap hazırlayın."),
        ("Müvekkil görüşme soruları","İlk görüşmede hangi bilgileri netleştirelim?","Sözleşmenin tarafları, önemli tarihler, ödemeler ve önceki bildirimler sorulmalı. Müvekkilin hedefini ve elindeki belgeleri ayrı ayrı kaydedin. Dosyada olmayan bir belgeyi varmış gibi kabul etmeyin."),
        ("Delil ve süre kontrolü","Beyan taslağını incelemeye göndermeden önce neyi kontrol edelim?","Talep sonucu ile olay kronolojisinin uyumunu, eklerin numarasını ve hangi iddiayı desteklediğini kontrol edin. Tebliğ ve son gün hesabını ikinci bir kişi doğrulasın.")]):
        conversation=put(db,ChatConversation,firm_id,f"chat:{admin.id}:{i}",law_firm_id=firm_id,user_id=admin.id,title=LABEL+title,created_at=now-timedelta(hours=i+1),updated_at=now-timedelta(hours=i+1))
        for n,(role,text) in enumerate([(ChatRole.USER,question),(ChatRole.ASSISTANT,DISCLAIMER+"\n\n"+answer)]):
            put(db,ChatMessage,firm_id,f"chat-message:{admin.id}:{i}:{n}",law_firm_id=firm_id,conversation_id=conversation.id,role=role,content=text,
                status=ChatMessageStatus.COMPLETE if n else None,model="fictional-presentation" if n else None,level="standard" if n else None,
                prompt_tokens=240 if n else None,completion_tokens=180 if n else None,latency_ms=600 if n else None,created_at=now-timedelta(hours=i+1)+timedelta(seconds=n))
    # Two personal case snapshots: a completed result and a resumable rehearsal.
    case=next(c for c in cases if c.case_number=="ÖRNEK-2026/153")
    for active in [False,True]:
        key=f"personal-court:{admin.id}:{active}"
        if db.get(CourtroomSession,identity(firm_id,key)):
            continue
        scenario=scenario_from_case(db,case,CourtroomRole.PLAINTIFF)
        scenario.title=LABEL+case.case_name+(" · devam eden prova" if active else " · tamamlanmış prova")
        session=put(db,CourtroomSession,firm_id,key,law_firm_id=firm_id,user_id=admin.id,scenario_id=scenario.id,
                    chosen_role=CourtroomRole.PLAINTIFF,opponent_role=CourtroomRole.DEFENDANT,
                    status=CourtroomSessionStatus.ACTIVE if active else CourtroomSessionStatus.COMPLETED,
                    phase=CourtroomPhase.MAIN_ARGUMENTS if active else CourtroomPhase.VERDICT,current_actor=CourtroomActor.USER if active else CourtroomActor.SYSTEM,
                    round_number=2 if active else 6,max_rounds=6,model="fictional-presentation",prompt_version="demo-v1",completed_at=None if active else now,
                    created_at=now-timedelta(minutes=30 if active else 60))
        rows=[(CourtroomActor.SYSTEM,"system",CourtroomTurnType.INSTRUCTION,DISCLAIMER),
              (CourtroomActor.USER,"plaintiff_lawyer",CourtroomTurnType.ARGUMENT,"Ekonomik koşullardaki değişimin kira ilişkisine etkisini sözleşme ve dönem karşılaştırmasıyla açıklıyoruz."),
              (CourtroomActor.OPPONENT,"defendant_lawyer",CourtroomTurnType.REBUTTAL,"Genel ekonomik göstergeler tek başına yeterli değildir; sözleşme riski ve somut işletme verisi birlikte incelenmelidir."),
              (CourtroomActor.JUDGE,"judge",CourtroomTurnType.QUESTION,"Sözleşmenin kurulduğu dönem ile bugünkü koşulları hangi doğrulanmış belgelerle karşılaştırıyorsunuz?")]
        if not active:
            rows.append((CourtroomActor.JUDGE,"judge",CourtroomTurnType.VERDICT,"Kurgusal eğitim değerlendirmesi: kayıtların dönem ve kaynak bakımından tamamlanması gerekiyor. Bu bir mahkeme kararı değildir."))
        for n,(actor,role,kind,content) in enumerate(rows,1):
            put(db,CourtroomTurn,firm_id,f"{key}:turn:{n}",session_id=session.id,sequence_number=n,actor=actor,legal_role=role,turn_type=kind,content=content,structured_data={"showcase":True})
        if not active:
            put(db,JudgeEvaluation,firm_id,f"{key}:evaluation",session_id=session.id,verdict="partial",summary=DISCLAIMER,
                reasoning="Dönem karşılaştırması ve somut işletme verileri tamamlanmadan kesin sonuç çıkarılamaz.",evidence_assessment=["Örnek sözleşme: koşullar ve tarih karşılaştırılmalı."],
                unanswered_questions=["Gider artışı hangi dönem kayıtlarıyla doğrulanıyor?"],user_strengths=["Talep ve delil bağlantısı kuruldu."],user_weaknesses=["Somut dönem karşılaştırması eksik."],learning_notes=["Karşı savunmayı belge bazında yanıtlayın."],
                relevance_score=20,evidence_score=18,rebuttal_score=17,courtroom_strategy_score=19,total_score=74,confidence="low",requires_verification=True,disclaimer=DISCLAIMER)
    db.flush()


def presentation_counts(db, firm_id):
    from app.models.courtroom import CourtroomSession
    models={"Davalar":Case,"Görevler":Task,"Belgeler":Document,"Takvim":CalendarEvent,"Büro iş akışları":ManagementRecord,"Ekip":User,"Dosya analizleri":Simulation,"Sohbetler":ChatConversation,"Duruşma provaları":CourtroomSession}
    counts = {name:db.query(model).filter(model.law_firm_id==firm_id).count() for name,model in models.items()}
    counts["Emsaller"] = db.query(Case).filter_by(law_firm_id=firm_id, is_precedent=True).count()
    counts["Davalar"] -= counts["Emsaller"]
    return counts
