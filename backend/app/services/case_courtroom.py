"""Build a clearly labelled training snapshot from an accessible case record."""
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.courtroom import CourtroomRole, CourtroomScenario, ScenarioDifficulty, ScenarioEvidence
from app.models.document import Document


def scenario_from_case(db: Session, case: Case, chosen_role: CourtroomRole) -> CourtroomScenario:
    """Use recorded fields only; a training snapshot is not a claim about the real hearing."""
    plaintiff = case.client_name if chosen_role == CourtroomRole.PLAINTIFF else (case.opposing_party or "Karşı taraf")
    defendant = (case.opposing_party or "Karşı taraf") if chosen_role == CourtroomRole.PLAINTIFF else case.client_name
    recorded = [
        f"Uygulamadaki dosya numarası {case.case_number}; dava adı {case.case_name}.",
        f"Kayıtlı mahkeme: {case.court or 'belirtilmemiş'}.",
        f"Kayıtlı açıklama: {case.description or 'ayrıntı girilmemiş'}.",
        f"Kayıtlı durum: {case.status.value}; sonuç: {case.outcome.value}.",
    ]
    if case.next_hearing_date:
        recorded.append(f"Uygulamadaki sonraki duruşma tarihi: {case.next_hearing_date:%d.%m.%Y}.")
    scenario = CourtroomScenario(
        slug=f"case-hearing-{uuid4().hex}",
        law_firm_id=case.law_firm_id,
        source_case_id=case.id,
        title=f"{case.case_number} · {case.case_name}",
        summary="Bu prova seçilen dava kaydının anlık görüntüsüdür; gerçek duruşma veya mahkeme kararı değildir.",
        category=case.case_type.value.replace("_", " ").title(),
        plaintiff_name=plaintiff,
        defendant_name=defendant,
        difficulty=ScenarioDifficulty.INTERMEDIATE,
        estimated_rounds=6,
        learning_objectives=["Kayıtlı bilgileri doğrulamak", "Delil boşluklarını ayırmak", "Karşı savunmaya somut yanıt vermek"],
        public_facts=recorded,
        disputed_issues=["Tarafların iddia ve savunmaları hangi asıl belgelere dayanıyor?", "Kayıttaki açıklamanın doğrulanmamış kısımları neler?", "Hangi deliller karşı tarafça tartışılabilir?"],
        plaintiff_private_brief={"objective": "Davacı tarafı adına kayıtlı talebi somut, doğrulanmış delille savunmak.", "known_facts": recorded, "strategy_notes": ["Eksik belgeleri mevcutmuş gibi sunma."]},
        defendant_private_brief={"objective": "Davalı tarafı adına kayıtlı iddiayı ve delillerin yeterliliğini sorgulamak.", "known_facts": recorded, "strategy_notes": ["Kayıtta olmayan vakıaları gerçekmiş gibi ileri sürme."]},
        judge_instructions={"focus": ["kayıtlı vakıa ve varsayım ayrımı", "delil yeterliliği", "tutarlı karşı cevap"], "simulation_only": True},
        legal_context=["Bu dosya provası eğitim amaçlıdır. Kayıtlı sonuç bile gerçek mahkeme evrakıyla ayrıca doğrulanmalıdır."],
    )
    db.add(scenario)
    db.flush()
    documents = db.query(Document).filter(Document.case_id == case.id, Document.law_firm_id == case.law_firm_id).order_by(Document.uploaded_at.desc()).limit(6).all()
    for index, document in enumerate(documents, start=1):
        db.add(ScenarioEvidence(
            scenario_id=scenario.id,
            code=f"CASE_DOC_{index}",
            title=document.filename,
            description="Uygulamadaki belge kaydı; aslı ve doğruluğu ayrıca kontrol edilmelidir.",
            evidence_type="dosya_belgesi",
            content=(document.extracted_text or "İçerik çıkarılamadı; asıl belgeyi kontrol edin.")[:1500],
            owner_role="both",
            initially_available=True,
            authenticity_status="unverified",
            sort_order=index,
        ))
    db.flush()
    return scenario
