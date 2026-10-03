"""Deterministic demo data seed.

Run with: python -m app.db.seed

Idempotent: safe to run multiple times (looks up by email/case_number
before inserting). Creates one demo law firm, an admin and a lawyer
user with known credentials, and a handful of demo cases so the app
is not empty on first login (used by E2E tests and local/demo use).
"""
from datetime import date, datetime, timedelta, timezone

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus, CaseType, CaseOutcome
from app.models.document import Document, DocumentType
from app.models.law_firm import LawFirm
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.core.config import settings
from app.db.courtroom_seed import seed_courtroom_scenarios
from app.db.purge import delete_cases

DEMO_FIRM_NAME = "Demo Hukuk Bürosu"
ADMIN_EMAIL = "admin@demo.casebridge.dev"
LAWYER_EMAIL = "avukat@demo.casebridge.dev"
DEMO_PASSWORD = "demo1234"


def _get_or_create_firm(db) -> LawFirm:
    firm = db.query(LawFirm).filter(LawFirm.name == DEMO_FIRM_NAME).first()
    if firm:
        return firm
    firm = LawFirm(name=DEMO_FIRM_NAME)
    db.add(firm)
    db.flush()
    return firm


def _get_or_create_user(db, firm: LawFirm, email: str, full_name: str, role: UserRole) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        law_firm_id=firm.id,
        email=email,
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name=full_name,
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def _get_or_create_case(db, firm: LawFirm, lawyer: User, **kwargs) -> Case:
    existing = (
        db.query(Case)
        .filter(Case.law_firm_id == firm.id, Case.case_number == kwargs["case_number"])
        .first()
    )
    if existing:
        return existing
    demo_case = Case(law_firm_id=firm.id, assigned_lawyer_id=lawyer.id, **kwargs)
    db.add(demo_case)
    db.flush()
    return demo_case


def _get_or_create_task(db, case: Case, lawyer: User, **kwargs) -> Task:
    existing = db.query(Task).filter(Task.case_id == case.id, Task.title == kwargs["title"]).first()
    if existing:
        return existing
    task = Task(
        case_id=case.id,
        law_firm_id=case.law_firm_id,
        assigned_to=lawyer.id,
        created_by=lawyer.id,
        **kwargs,
    )
    db.add(task)
    db.flush()
    return task


def _get_or_create_document(db, case: Case, lawyer: User, **kwargs) -> Document:
    existing = (
        db.query(Document)
        .filter(Document.case_id == case.id, Document.filename == kwargs["filename"])
        .first()
    )
    if existing:
        return existing
    document = Document(
        case_id=case.id,
        law_firm_id=case.law_firm_id,
        uploaded_by=lawyer.id,
        storage_path=f"demo://{case.case_number}/{kwargs['filename']}",
        **kwargs,
    )
    db.add(document)
    db.flush()
    return document


def _get_or_create_event(db, case: Case, lawyer: User, **kwargs) -> CaseEvent:
    existing = (
        db.query(CaseEvent)
        .filter(CaseEvent.case_id == case.id, CaseEvent.title == kwargs["title"])
        .first()
    )
    if existing:
        return existing
    event = CaseEvent(
        case_id=case.id,
        law_firm_id=case.law_firm_id,
        created_by=lawyer.id,
        **kwargs,
    )
    db.add(event)
    db.flush()
    return event


DEMO_CASES = [
    dict(
        case_number="2026/101",
        case_name="Kiracı Tahliye Davası",
        client_name="Ahmet Yılmaz",
        opposing_party="Zeynep Kaya",
        case_type=CaseType.KIRA,
        court="İstanbul 3. Sulh Hukuk Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=40),
        next_hearing_date=date.today() + timedelta(days=14),
        case_value=180000.0,
        description="Kira bedelinin ödenmemesi nedeniyle tahliye talebi.",
    ),
    dict(
        case_number="2026/088",
        case_name="İşe İade Davası",
        client_name="Mehmet Demir",
        opposing_party="ABC Lojistik A.Ş.",
        case_type=CaseType.IS_HUKUKU,
        court="Ankara 5. İş Mahkemesi",
        status=CaseStatus.DURUSMA_BEKLEYEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=90),
        next_hearing_date=date.today() + timedelta(days=21),
        case_value=95000.0,
        description="Haksız fesih iddiasıyla işe iade talebi.",
    ),
    dict(
        case_number="2025/240",
        case_name="Ticari Alacak Davası",
        client_name="Yılmaz Tekstil Ltd. Şti.",
        opposing_party="Deniz İnşaat A.Ş.",
        case_type=CaseType.TICARET_HUKUKU,
        court="İzmir 2. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=date.today() - timedelta(days=400),
        case_value=560000.0,
        description="Ödenmeyen fatura bedellerinin tahsili.",
    ),
    dict(
        case_number="2025/175",
        case_name="Sözleşme İhlali Tazminat Davası",
        client_name="Kaan Öztürk",
        opposing_party="Mavi Yapı A.Ş.",
        case_type=CaseType.SOZLESME,
        court="İstanbul 4. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.LOST,
        opening_date=date.today() - timedelta(days=300),
        case_value=210000.0,
        description="Sözleşme ihlali iddiasıyla açılan tazminat davası; talep reddedildi.",
    ),
    dict(
        case_number="2026/115",
        case_name="Kat Mülkiyeti Aidat Alacağı",
        client_name="Güneş Apartmanı Yönetimi",
        opposing_party="Cem Aksoy",
        case_type=CaseType.ICRA,
        court="İstanbul 12. İcra Hukuk Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=65),
        next_hearing_date=date.today() + timedelta(days=8),
        case_value=78000.0,
        description="Ödenmeyen ortak gider ve aidatların tahsili.",
    ),
    dict(
        case_number="2026/119",
        case_name="Marka Lisans Uyuşmazlığı",
        client_name="Nova Yazılım A.Ş.",
        opposing_party="Kare Medya Ltd. Şti.",
        case_type=CaseType.SOZLESME,
        court="İstanbul 2. Fikri ve Sınai Haklar Hukuk Mahkemesi",
        status=CaseStatus.KARAR_BEKLEYEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=120),
        next_hearing_date=date.today() + timedelta(days=35),
        case_value=740000.0,
        description="Lisans bedeli ve marka kullanım kapsamına ilişkin uyuşmazlık.",
    ),
    dict(
        case_number="2026/124",
        case_name="Fazla Mesai Alacağı Davası",
        client_name="Burcu Şen",
        opposing_party="Pera Perakende A.Ş.",
        case_type=CaseType.IS_HUKUKU,
        court="İstanbul 18. İş Mahkemesi",
        status=CaseStatus.DURUSMA_BEKLEYEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=74),
        next_hearing_date=date.today() + timedelta(days=17),
        case_value=132000.0,
        description="Fazla çalışma ve hafta tatili ücretlerinin tahsili.",
    ),
    dict(
        case_number="2026/131",
        case_name="Eser Sözleşmesi Eksik İş Davası",
        client_name="Deniz Yapı Kooperatifi",
        opposing_party="Usta Proje Ltd. Şti.",
        case_type=CaseType.SOZLESME,
        court="Bursa 4. Asliye Hukuk Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=55),
        next_hearing_date=date.today() + timedelta(days=29),
        case_value=480000.0,
        description="Teslim edilen işlerdeki eksikliklerin giderilmesi ve tazminat talebi.",
    ),
    dict(
        case_number="2026/138",
        case_name="İtirazın İptali Davası",
        client_name="Mert Elektronik Ltd. Şti.",
        opposing_party="Atlas Mağazacılık A.Ş.",
        case_type=CaseType.ICRA,
        court="Ankara 7. Asliye Ticaret Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=48),
        next_hearing_date=date.today() + timedelta(days=11),
        case_value=315000.0,
        description="Fatura alacağına yapılan icra itirazının iptali talebi.",
    ),
    dict(
        case_number="2026/142",
        case_name="Bayilik Sözleşmesinin Feshi",
        client_name="Rota Gıda A.Ş.",
        opposing_party="Lezzet Noktası Ltd. Şti.",
        case_type=CaseType.TICARET_HUKUKU,
        court="İstanbul 9. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KARAR_BEKLEYEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=160),
        next_hearing_date=date.today() + timedelta(days=43),
        case_value=980000.0,
        description="Bayilik koşullarının ihlali nedeniyle sözleşmenin feshi ve alacak talebi.",
    ),
    dict(
        case_number="2026/149",
        case_name="Depozito İadesi Davası",
        client_name="Elif Korkmaz",
        opposing_party="Volkan Ergin",
        case_type=CaseType.KIRA,
        court="İzmir 6. Sulh Hukuk Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=36),
        next_hearing_date=date.today() + timedelta(days=24),
        case_value=60000.0,
        description="Kira ilişkisinin sonunda depozitonun iade edilmemesine ilişkin alacak talebi.",
    ),
    dict(
        case_number="2026/153",
        case_name="Ticari Kira Uyarlama Davası",
        client_name="Arma Tasarım Ltd. Şti.",
        opposing_party="Merkez Gayrimenkul A.Ş.",
        case_type=CaseType.KIRA,
        court="İstanbul 14. Sulh Hukuk Mahkemesi",
        status=CaseStatus.DURUSMA_BEKLEYEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=82),
        next_hearing_date=date.today() + timedelta(days=6),
        case_value=420000.0,
        description="Değişen ekonomik koşullar nedeniyle ticari kira bedelinin uyarlanması.",
    ),
    dict(
        case_number="2026/161",
        case_name="İş Kazası Tazminat Davası",
        client_name="Onur Güler",
        opposing_party="Kuzey Metal A.Ş.",
        case_type=CaseType.IS_HUKUKU,
        court="Kocaeli 3. İş Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=97),
        next_hearing_date=date.today() + timedelta(days=31),
        case_value=850000.0,
        description="İş kazasından kaynaklanan maddi ve manevi tazminat talebi.",
    ),
    dict(
        case_number="2026/168",
        case_name="Hizmet Sözleşmesi Alacağı",
        client_name="Bulut Danışmanlık A.Ş.",
        opposing_party="Eksen Enerji Ltd. Şti.",
        case_type=CaseType.TICARET_HUKUKU,
        court="Ankara 3. Asliye Ticaret Mahkemesi",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=date.today() - timedelta(days=28),
        next_hearing_date=date.today() + timedelta(days=19),
        case_value=265000.0,
        description="Danışmanlık hizmeti karşılığı ödenmeyen bedelin tahsili.",
    ),
    dict(
        case_number="2025/201",
        case_name="Kıdem Tazminatı Davası",
        client_name="Ayşe Tunç",
        opposing_party="Vadi Tekstil A.Ş.",
        case_type=CaseType.IS_HUKUKU,
        court="İstanbul 11. İş Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=date.today() - timedelta(days=390),
        case_value=225000.0,
        description="Kıdem ve ihbar tazminatı talepli dava kabul edildi.",
    ),
    dict(
        case_number="2025/166",
        case_name="Cari Hesap Alacağı Davası",
        client_name="Ada Makine Ltd. Şti.",
        opposing_party="Doruk Sanayi A.Ş.",
        case_type=CaseType.TICARET_HUKUKU,
        court="Bursa 2. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=date.today() - timedelta(days=460),
        case_value=610000.0,
        description="Cari hesap bakiyesinin tahsiline karar verildi.",
    ),
    dict(
        case_number="2025/142",
        case_name="Kira Tespit Davası",
        client_name="Selin Erdem",
        opposing_party="Umut Uçar",
        case_type=CaseType.KIRA,
        court="Ankara 9. Sulh Hukuk Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=date.today() - timedelta(days=430),
        case_value=145000.0,
        description="Yeni dönem kira bedelinin tespiti talebi kabul edildi.",
    ),
    dict(
        case_number="2024/318",
        case_name="Haksız Rekabet Davası",
        client_name="Mavi Dijital A.Ş.",
        opposing_party="Kırmızı Reklam Ltd. Şti.",
        case_type=CaseType.TICARET_HUKUKU,
        court="İstanbul 5. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=date.today() - timedelta(days=610),
        case_value=1200000.0,
        description="Haksız rekabetin tespiti ve önlenmesi talepleri kabul edildi.",
    ),
    dict(
        case_number="2025/120",
        case_name="Cezai Şart Alacağı Davası",
        client_name="Ekin Organizasyon Ltd. Şti.",
        opposing_party="Masa Etkinlik A.Ş.",
        case_type=CaseType.SOZLESME,
        court="İzmir 3. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.LOST,
        opening_date=date.today() - timedelta(days=455),
        case_value=330000.0,
        description="Cezai şart talebi ölçüsüz bulundu ve dava reddedildi.",
    ),
    dict(
        case_number="2024/284",
        case_name="Menfi Tespit Davası",
        client_name="Arı Lojistik Ltd. Şti.",
        opposing_party="Kent Akaryakıt A.Ş.",
        case_type=CaseType.ICRA,
        court="Ankara 4. Asliye Ticaret Mahkemesi",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.LOST,
        opening_date=date.today() - timedelta(days=640),
        case_value=440000.0,
        description="Borçlu olunmadığının tespiti talebi reddedildi.",
    ),
]


DEMO_TASKS = [
    ("2026/101", "Duruşma hazırlık notunu tamamla", 5, TaskStatus.PENDING),
    ("2026/088", "Tanık beyanlarını özetle", 9, TaskStatus.PENDING),
    ("2026/115", "Aidat hesap tablosunu kontrol et", 3, TaskStatus.PENDING),
    ("2026/119", "Lisans sözleşmesi eklerini karşılaştır", 14, TaskStatus.PENDING),
    ("2026/124", "Bordro bilirkişi raporuna itiraz hazırla", 7, TaskStatus.PENDING),
    ("2026/138", "Arabuluculuk son tutanağını dosyala", -2, TaskStatus.COMPLETED),
    ("2026/149", "Anahtar teslim tutanağını müvekkilden iste", 12, TaskStatus.PENDING),
    ("2026/153", "Emsal kira araştırmasını güncelle", 4, TaskStatus.PENDING),
    ("2026/161", "Hastane kayıtları için müzekkere taslağı hazırla", 18, TaskStatus.PENDING),
    ("2026/168", "Karşı taraf cevabına beyan süresini takip et", 10, TaskStatus.PENDING),
]


DEMO_DOCUMENTS = [
    ("2026/101", "kira-sozlesmesi-ozeti.txt", "Kira başlangıcı: 01.01.2024\nAylık kira bedeli: 15.000 TL."),
    ("2026/088", "fesih-bildirimi.txt", "İş sözleşmesinin fesih bildirimine ilişkin kısa demo metni."),
    ("2026/115", "aidat-hesabi.txt", "Ocak-Haziran dönemi aidat bakiye özeti: 78.000 TL."),
    ("2026/119", "lisans-maddeleri.txt", "Marka kullanım süresi ve bölgesine ilişkin sözleşme maddeleri özeti."),
    ("2026/124", "bordro-notlari.txt", "Fazla çalışma iddiasına konu bordro dönemleri: Ocak-Haziran 2026."),
    ("2026/138", "arabuluculuk-tutanagi.txt", "Tarafların anlaşamaması üzerine düzenlenen son tutanak özeti."),
    ("2026/153", "emsal-kira-listesi.txt", "Aynı bölgede bulunan üç ticari taşınmaza ait örnek kira bedelleri."),
    ("2026/161", "saglik-kaydi-ozeti.txt", "Tedavi tarihleri ve geçici iş göremezlik süresine ilişkin kısa özet."),
]


DEMO_EVENTS = [
    ("2026/153", "Emsal kira araştırması dosyaya eklendi", CaseEventType.SUBMISSION, 0),
    ("2026/124", "Bilirkişi raporu taraflara tebliğ edildi", CaseEventType.EXPERT_REPORT, 1),
    ("2026/101", "Yeni duruşma günü belirlendi", CaseEventType.HEARING, 2),
    ("2026/138", "Arabuluculuk son tutanağı yüklendi", CaseEventType.SUBMISSION, 3),
    ("2026/119", "Karşı taraf cevap dilekçesini sundu", CaseEventType.FILING, 4),
    ("2026/161", "Hastane kayıtları talep edildi", CaseEventType.LEGAL_UPDATE, 5),
    ("2026/115", "Aidat hesabı güncellendi", CaseEventType.NOTE, 6),
    ("2026/149", "Ön inceleme duruşması yapıldı", CaseEventType.HEARING, 7),
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        firm = _get_or_create_firm(db)
        _get_or_create_user(db, firm, ADMIN_EMAIL, "Demo Yönetici", UserRole.ADMIN)
        lawyer = _get_or_create_user(db, firm, LAWYER_EMAIL, "Demo Avukat", UserRole.LAWYER)

        if not settings.seed_demo_data:
            demo_numbers = [c["case_number"] for c in DEMO_CASES]
            stale = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number.in_(demo_numbers)).all()
            removed = delete_cases(db, stale)
            scenario_count = seed_courtroom_scenarios(db)
            db.commit()
            print(f"Seed complete (real data mode). Firm: {DEMO_FIRM_NAME}")
            print(f"  Admin login:  {ADMIN_EMAIL} / {DEMO_PASSWORD}")
            print(f"  Lawyer login: {LAWYER_EMAIL} / {DEMO_PASSWORD}")
            print(f"  Demo cases removed: {removed}")
            print(f"  Courtroom scenarios: {scenario_count}")
            return

        demo_cases = {
            case_kwargs["case_number"]: _get_or_create_case(db, firm, lawyer, **case_kwargs)
            for case_kwargs in DEMO_CASES
        }

        for case_number, title, due_in_days, status in DEMO_TASKS:
            _get_or_create_task(
                db,
                demo_cases[case_number],
                lawyer,
                title=title,
                description="Demo görev kaydı",
                due_date=date.today() + timedelta(days=due_in_days),
                status=status,
                completed_at=(
                    datetime.now(timezone.utc) - timedelta(days=1)
                    if status == TaskStatus.COMPLETED
                    else None
                ),
            )

        for index, (case_number, filename, extracted_text) in enumerate(DEMO_DOCUMENTS):
            _get_or_create_document(
                db,
                demo_cases[case_number],
                lawyer,
                filename=filename,
                file_type=DocumentType.TXT,
                extracted_text=extracted_text,
                uploaded_at=datetime.now(timezone.utc) - timedelta(days=index),
            )

        for case_number, title, event_type, days_ago in DEMO_EVENTS:
            _get_or_create_event(
                db,
                demo_cases[case_number],
                lawyer,
                title=title,
                description="Demo dava gelişmesi",
                event_type=event_type,
                event_date=date.today() - timedelta(days=days_ago),
                created_at=datetime.now(timezone.utc) - timedelta(hours=days_ago),
            )

        scenario_count = seed_courtroom_scenarios(db)

        db.commit()
        print(f"Seed complete. Firm: {DEMO_FIRM_NAME}")
        print(f"  Admin login:  {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Lawyer login: {LAWYER_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Demo cases: {len(DEMO_CASES)}")
        print(f"  Demo tasks: {len(DEMO_TASKS)}")
        print(f"  Demo documents: {len(DEMO_DOCUMENTS)}")
        print(f"  Demo activities: {len(DEMO_EVENTS)}")
        print(f"  Courtroom scenarios: {scenario_count}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
