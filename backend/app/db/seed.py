"""Deterministic demo data seed.

Run with: python -m app.db.seed

Idempotent: safe to run multiple times (looks up by email/case_number
before inserting). Creates one demo law firm, an admin and three lawyers
user with known credentials, and a handful of demo cases so the app
is not empty on first login (used by E2E tests and local/demo use).
"""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.core.security import hash_password
from app.db.migrate import upgrade_to_head
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus, CaseType, CaseOutcome
from app.models.document import Document, DocumentType
from app.models.law_firm import LawFirm
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.core.config import settings
from app.db.courtroom_seed import seed_courtroom_scenarios
from app.db.courtroom_showcase_seed import seed_courtroom_showcases
from app.db.demo_case_detail_seed import CASE_EVIDENCE
from app.db.purge import delete_cases

DEMO_FIRM_NAME = "Demo Hukuk Bürosu"
ADMIN_EMAIL = "admin@demo.casebridge.dev"
LAWYER_EMAIL = "avukat@demo.casebridge.dev"
DEMO_LAWYERS = (
    (LAWYER_EMAIL, "Emre Yılmaz", "Ticaret Hukuku", "male"),
    ("kerem@demo.casebridge.dev", "Kerem Demir", "İş Hukuku", "male"),
    ("zeynep@demo.casebridge.dev", "Zeynep Arslan", "Kira ve Gayrimenkul Hukuku", "female"),
)
DEMO_PASSWORD = "demo1234"


def _get_or_create_firm(db) -> LawFirm:
    firm = db.query(LawFirm).filter(LawFirm.name == DEMO_FIRM_NAME).first()
    if firm:
        return firm
    firm = LawFirm(name=DEMO_FIRM_NAME)
    db.add(firm)
    db.flush()
    return firm


def _get_or_create_user(db, firm: LawFirm, email: str, full_name: str, role: UserRole, department: str | None = None, gender: str | None = None) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        if email == LAWYER_EMAIL and user.full_name == "Demo Avukat":
            user.full_name = full_name
        if department and not user.department:
            user.department = department
        if gender and not user.gender:
            user.gender = gender
        return user
    user = User(
        law_firm_id=firm.id,
        email=email,
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name=full_name,
        department=department,
        gender=gender,
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


def _get_or_create_demo_note(db, case: Case, lawyer: User, filename: str, content: str) -> Document:
    """Persist a downloadable, labelled internal note without replacing user edits."""
    existing = db.query(Document).filter(Document.case_id == case.id, Document.filename == filename).first()
    if existing:
        return existing
    path = Path(settings.storage_dir) / case.law_firm_id / case.id / f"seed_{filename}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    document = Document(
        case_id=case.id,
        law_firm_id=case.law_firm_id,
        uploaded_by=lawyer.id,
        filename=filename,
        file_type=DocumentType.TXT,
        storage_path=str(path),
        extracted_text=content,
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


TICARI_KIRA_TASKS = [
    ("Kira sözleşmesi ve tüm eklerini müvekkilden temin et", "Başlangıç tarihi, artış hükmü, kullanım amacı ve uyarlama şartlarının denetlenebilmesi için imzalı sözleşme ile eklerini dosyaya yükle.", 1, TaskStatus.PENDING),
    ("Taşınmazın açık adresi ve nitelik fişini tamamla", "İlçe, mahalle, cadde/sokak, brüt-net m², kat, cephe, bina yaşı, kullanım türü ve mevcut kira bedelini doğrula. Bu bilgiler olmadan aynı bölge emsali seçilemez.", 1, TaskStatus.PENDING),
    ("Üç doğrulanabilir emsal için dayanak belge topla", "Aynı kullanım türü ve yakın çevreden en az üç taşınmaz için ilan tarihi, adres, alan, aylık bedel, TL/m² ve kaynak bağlantısını kaydet; mümkünse imzalı kira kontratı veya ekspertiz doğrulaması iste.", 2, TaskStatus.PENDING),
    ("TCMB 2026/2Ç piyasa verisini hesaplamaya işle", "İstanbul ticari gayrimenkul endeksindeki çeyreklik ve yıllık değişimi yalnızca piyasa eğilimi olarak değerlendir; doğrudan kira emsali yerine kullanma.", 2, TaskStatus.PENDING),
    ("Bilirkişi keşfi için teknik soru listesini hazırla", "Emsallerin konum, alan, cephe, kullanım niteliği ve boş-dolu kiralama farklarının karşılaştırılması için bilirkişiye yöneltilecek soruları hazırla.", 3, TaskStatus.PENDING),
    ("10 Ekim duruşması delil klasörünü tamamla", "Sözleşme, ödeme geçmişi, resmi piyasa verisi, UYAP karar notları ve doğrulanmış emsal tablosunu duruşma klasöründe birleştir.", 5, TaskStatus.PENDING),
    ("UYAP kira bedeli içtihat taramasını dosyala", "TBK 344 ölçütleri ve hakkaniyet indirimiyle ilgili resmi karar özetleri kaynak adresleriyle dosyaya eklendi.", -1, TaskStatus.COMPLETED),
]


DEMO_DOCUMENTS = [
    ("2026/101", "kira-sozlesmesi-ozeti.txt", "Kira başlangıcı: 01.01.2024\nAylık kira bedeli: 15.000 TL."),
    ("2026/088", "fesih-bildirimi.txt", "İş sözleşmesinin fesih bildirimine ilişkin kısa demo metni."),
    ("2026/115", "aidat-hesabi.txt", "Ocak-Haziran dönemi aidat bakiye özeti: 78.000 TL."),
    ("2026/119", "lisans-maddeleri.txt", "Marka kullanım süresi ve bölgesine ilişkin sözleşme maddeleri özeti."),
    ("2026/124", "bordro-notlari.txt", "Fazla çalışma iddiasına konu bordro dönemleri: Ocak-Haziran 2026."),
    ("2026/138", "arabuluculuk-tutanagi.txt", "Tarafların anlaşamaması üzerine düzenlenen son tutanak özeti."),
    ("2026/161", "saglik-kaydi-ozeti.txt", "Tedavi tarihleri ve geçici iş göremezlik süresine ilişkin kısa özet."),
]


TICARI_KIRA_DOCUMENTS = [
    (
        "emsal-kira-arastirma-durumu.txt",
        """EMSAL KİRA ARAŞTIRMASI — DOĞRULAMA DURUMU

Dosya: İstanbul 14. Sulh Hukuk Mahkemesi, 2026/153
Taraflar: Arma Tasarım Ltd. Şti. / Merkez Gayrimenkul A.Ş.
Uyuşmazlık: Değişen ekonomik koşullar nedeniyle ticari kira bedelinin uyarlanması

SONUÇ
Dosyada kiralananın ilçe, mahalle, açık adres, brüt/net alan, kat, cephe, bina yaşı ve kullanım türü bilgileri bulunmamaktadır. Bu nedenle “aynı bölgede bulunan üç ticari taşınmaz” için doğrulanabilir emsal bedel üretilememiştir. Önceki tek cümlelik emsal kaydı delil niteliğinde değildi ve bu doğrulama notuyla değiştirilmiştir.

GERÇEK EMSAL İÇİN ZORUNLU ALANLAR
1. Açık adres ve taşınmazın kullanım türü
2. Brüt ve net m²
3. Kat, cephe, erişim, bina yaşı ve fiziksel durum
4. İlan veya sözleşme tarihi
5. Aylık brüt/net kira ve TL/m²
6. Kaynak URL, ilan numarası veya imzalı sözleşme
7. Dava konusu taşınmazla farklılıkların düzeltme gerekçesi

UYARI
İstanbul geneli endeksler, belirli bir mahalledeki üç emsal kira yerine geçmez. Adres ve nitelik bilgileri tamamlandıktan sonra aynı alt pazardan karşılaştırılabilir üç kayıt seçilmelidir.

Hazırlanma tarihi: 04.10.2026""",
    ),
    (
        "tcmb-ticari-gayrimenkul-2026-2c.txt",
        """TCMB TİCARİ GAYRİMENKUL PİYASA NOTU — 2026 2. ÇEYREK

Kaynak: Türkiye Cumhuriyet Merkez Bankası, Ticari Gayrimenkul Fiyat Endeksi.

RESMİ VERİ ÖZETİ
- Türkiye TGFE: çeyreklik %5,5 artış; yıllık nominal %29,4 artış; yıllık reel %2,2 azalış.
- Türkiye Dükkan Fiyat Endeksi: çeyreklik %5,4; yıllık nominal %29,2; yıllık reel %2,4 azalış.
- Türkiye Ofis Fiyat Endeksi: çeyreklik %6,0; yıllık nominal %30,6; yıllık reel %1,3 azalış.
- İstanbul TGFE: çeyreklik %5,3; yıllık nominal %27,8 artış.

DOSYA BAKIMINDAN KULLANIM
Bu veriler İstanbul ticari gayrimenkul piyasasındaki genel fiyat yönünü gösterir. Kira bedeli veya belirli bir taşınmazın rayici değildir; bilirkişi tarafından seçilecek aynı bölge ve nitelikteki kira emsallerinin yerine kullanılamaz.

Kaynak sayfası: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Reel+Sektor+Istatistikleri/TGFE/
Rapor: https://www.tcmb.gov.tr/wps/wcm/connect/1d317a23-f499-461e-8963-bf954ff20a41/TGFE-Rapor.pdf
Erişim tarihi: 04.10.2026""",
    ),
    (
        "uyap-kira-bedeli-emsal-kriterleri.txt",
        """UYAP RESMİ İÇTİHAT NOTU — KİRA BEDELİ VE EMSAL KRİTERLERİ

1. TBK 344/3 ölçütleri
UYAP'ta yayımlanan kararda, beş yıldan uzun veya beş yıldan sonra yenilenen kiralarda hâkimin TÜFE on iki aylık ortalaması, kiralananın durumu ve emsal kira bedellerini birlikte değerlendirerek hakkaniyete uygun bedel belirlemesi gerektiği açıklanmaktadır.
Kaynak: https://mevzuat.adalet.gov.tr/ictihat/1225412500

2. Ticari taşınmaz ve hakkaniyet indirimi örneği
Başka bir resmi UYAP kararında çatılı işyeri için bilirkişi aylık brüt rayici 581.250 TL olarak belirlemiş; eski kiracılık nedeniyle %10 hakkaniyet indirimi uygulanarak 523.125 TL sonucuna ulaşılmıştır. Bu rakamlar bu dosyanın emsali değildir; değerlendirme yöntemini gösteren karar verisidir.
Kaynak: https://mevzuat.adalet.gov.tr/ictihat/1219367600

3. Dosyaya etkisi
Taşınmazın açık adresi ve fiziksel nitelikleri tamamlanmadan seçilen ilanlar karşılaştırılabilir kabul edilmemelidir. Emsallerin gerçekten kiraya verilmiş olup olmadığı, tarihleri, yüzölçümleri ve boş/dolu kiralama koşulları doğrulanmalıdır.

Erişim tarihi: 04.10.2026
Not: Bu çalışma hukuki görüş yerine kaynaklı dosya araştırma notudur.""",
    ),
    (
        "delil-eksikligi-ve-belge-talep-listesi.txt",
        """DOSYA DELİL DENETİMİ — 2026/153

MEVCUT DOĞRULANMIŞ KAYITLAR
- Mahkeme: İstanbul 14. Sulh Hukuk Mahkemesi
- Dava türü: Ticari kira bedelinin uyarlanması
- Dava değeri: 420.000 TL
- Açılış tarihi: 14.07.2026
- Sonraki duruşma: 10.10.2026

DOSYADA BULUNMAYAN TEMEL BELGELER
- İmzalı kira sözleşmesi ve ekleri
- Taşınmazın açık adresi, tapu veya bağımsız bölüm bilgisi
- Brüt/net alan ile fiziksel nitelik dökümü
- Mevcut kira ödeme dekontları ve artış geçmişi
- Uyarlama talebine esas hesap tablosu
- Aynı alt pazardan doğrulanmış en az üç kira emsali
- Varsa ekspertiz veya bilirkişi ön değerlendirmesi

ÖNCELİK
Bu eksikler tamamlanmadan emsal kira tablosu kesin delil olarak sunulmamalıdır. İlk iş, müvekkilden sözleşme ve taşınmaz niteliklerini istemek; ardından aynı mahalle ve kullanım türünde kaynaklı emsal toplamaktır.

Hazırlanma tarihi: 04.10.2026""",
    ),
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


TICARI_KIRA_EVENTS = [
    ("Dava kaydı açıldı", "Ticari kira bedelinin değişen ekonomik koşullara göre uyarlanması talebi 2026/153 numarasıyla kayda alındı.", CaseEventType.FILING, 82),
    ("Duruşma tarihi dosyaya işlendi", "İstanbul 14. Sulh Hukuk Mahkemesindeki duruşma 10.10.2026 olarak takvime kaydedildi.", CaseEventType.HEARING, 78),
    ("Ön emsal kaydının yetersiz olduğu tespit edildi", "Önceki kayıtta adres, m², ilan tarihi ve kaynak bulunmadığı için üç taşınmazın doğrulanabilir emsal sayılamayacağı not edildi.", CaseEventType.NOTE, 2),
    ("TCMB 2026/2Ç ticari gayrimenkul verisi eklendi", "İstanbul için çeyreklik %5,3 ve yıllık nominal %27,8 TGFE değişimini içeren resmi TCMB piyasa notu dosyalandı.", CaseEventType.SUBMISSION, 0),
    ("UYAP kira bedeli içtihat notu eklendi", "TBK 344 ölçütleri, emsal incelemesi ve hakkaniyet indirimiyle ilgili iki resmi UYAP kararının kaynaklı özeti dosyaya eklendi.", CaseEventType.LEGAL_UPDATE, 0),
    ("Delil eksikliği ve belge talep listesi hazırlandı", "Sözleşme, açık adres, taşınmaz nitelikleri, ödeme geçmişi ve doğrulanmış emsaller için tamamlanması gerekenler listelendi.", CaseEventType.NOTE, 0),
]


def _seed_case_detail(db, case: Case, lawyer: User) -> None:
    """Make every fictional demo case useful without inventing court evidence."""
    evidence = CASE_EVIDENCE[case.case_number]
    closed = case.status == CaseStatus.KAPALI
    result = {CaseOutcome.WON: "Kabul", CaseOutcome.LOST: "Ret"}.get(case.outcome, "Devam ediyor")
    fact_lines = [
        "DEMO DOSYA KAYDI — İÇ ÇALIŞMA NOTU",
        "Bu metin mevcut veri tabanı alanlarından üretilmiştir; mahkeme evrakı veya müvekkil belgesi değildir.",
        "",
        f"Dosya: {case.case_number} — {case.case_name}",
        f"Müvekkil: {case.client_name}",
        f"Karşı taraf: {case.opposing_party or 'Kayıt yok'}",
        f"Mahkeme: {case.court or 'Kayıt yok'}",
        f"Açılış tarihi: {case.opening_date:%d.%m.%Y}",
        f"Durum / kayıtlı sonuç: {case.status.value} / {result}",
        f"Dava değeri: {case.case_value:,.0f} TL" if case.case_value is not None else "Dava değeri: Kayıt yok",
        f"Sonraki duruşma: {case.next_hearing_date:%d.%m.%Y}" if case.next_hearing_date else "Sonraki duruşma: Kayıt yok",
        f"Veri tabanındaki açıklama: {case.description or 'Kayıt yok'}",
        "",
        "Doğrulama sınırı: Dilekçe, karar ve diğer asıl evraklar bu nottan çıkarılamaz; ayrıca temin edilmelidir.",
    ]
    _get_or_create_demo_note(db, case, lawyer, "demo-dosya-kaydi.txt", "\n".join(fact_lines))
    evidence_lines = [
        "DELİL VE EVRAK KONTROL LİSTESİ — DEMO İÇ NOT",
        f"Dosya: {case.case_number} — {case.case_name}",
        "Aşağıdaki evrakın mevcut olduğu varsayılmıyor. Her biri asıl kaynaktan istenmeli ve doğrulanmalıdır.",
        "",
        *(f"[DOĞRULANMADI] {item}" for item in evidence),
        "",
        "Kontrol: belge tarihi, tarafları, imza/tebliğ bilgisi ve dosya numarası asıl evrakla eşleştirilmeli.",
        "Kamuya açık internet kaynakları bu özel davanın gerçek dilekçesi veya kararı yerine geçmez.",
    ]
    _get_or_create_demo_note(db, case, lawyer, "demo-delil-kontrol-listesi.txt", "\n".join(evidence_lines))

    today = date.today()
    actions = [
        ("Asıl dava evrakını doğrula", f"{case.case_number} dosyasının dilekçe, ara karar ve varsa gerekçeli kararını yetkili dosya kaynağından temin edip taraf/dosya numarasıyla eşleştir.", 3),
        ("Birincil delilleri temin et", f"Öncelikle şu belgeyi iste ve dosyala: {evidence[0]}. Ardından {evidence[1]} için kaynak ve tarih kontrolü yap.", 5),
        ("Dosya sonucunu ve takibi kontrol et" if closed else "Duruşma ve süre takibini güncelle",
         ("Kayıtlı sonuç " + result.lower() + "; gerekçeli karar, kesinleşme, olası kanun yolu ve tahsilat durumunu asıl dosyadan doğrula."
          if closed else f"Sonraki duruşma {case.next_hearing_date:%d.%m.%Y} olarak kayıtlı. Tebliğleri, süreleri ve delil sunma durumunu asıl dosyadan teyit et."), 7),
    ]
    for title, description, due_in_days in actions:
        _get_or_create_task(db, case, lawyer, title=title, description=description,
                            due_date=today + timedelta(days=due_in_days), status=TaskStatus.PENDING)

    event_rows = [
        ("Demo dava kaydı açıldı", f"{case.case_number} numaralı {case.case_name} kaydının açılış tarihi veri tabanında {case.opening_date:%d.%m.%Y} olarak yer alıyor; bu bir mahkeme tevzi belgesi değildir.", case.opening_date),
        ("Dosya bilgileri iç not olarak derlendi", f"{case.client_name} ile {case.opposing_party or 'karşı taraf'} arasındaki uyuşmazlığın mevcut veri tabanı özeti oluşturuldu. Asıl dilekçe ve karar ayrıca doğrulanmalıdır.", today),
        ("Eksik delil ve takip listesi hazırlandı", f"{evidence[0]}; {evidence[1]}; {evidence[2]} için kaynak kontrolü ve takip görevleri açıldı. Bu belgelerin dosyada bulunduğu iddia edilmiyor.", today),
    ]
    for title, description, event_date in event_rows:
        _get_or_create_event(db, case, lawyer, title=title, description=description,
                             event_type=CaseEventType.NOTE, event_date=event_date)


def seed() -> None:
    upgrade_to_head(engine)
    db = SessionLocal()
    try:
        firm = _get_or_create_firm(db)
        admin = _get_or_create_user(db, firm, ADMIN_EMAIL, "Demo Yönetici", UserRole.ADMIN)
        legacy_lawyer = db.query(User).filter(User.email == LAWYER_EMAIL, User.full_name == "Demo Avukat").first()
        lawyers = [
            _get_or_create_user(db, firm, email, name, UserRole.LAWYER, department, gender)
            for email, name, department, gender in DEMO_LAWYERS
        ]
        lawyer = lawyers[0]

        # Preserve legacy case records while ensuring every existing case in
        # the demo firm has an owner, including when demo data is disabled.
        unassigned = db.query(Case).filter(
            Case.law_firm_id == firm.id, Case.assigned_lawyer_id.is_(None),
            Case.is_precedent.is_(False),
        ).order_by(Case.case_number).all()
        for index, case in enumerate(unassigned):
            case.assigned_lawyer_id = lawyers[index % len(lawyers)].id

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

        demo_cases = {}
        for index, case_kwargs in enumerate(DEMO_CASES):
            case_type = case_kwargs["case_type"]
            assigned = (
                lawyers[0] if case_type == CaseType.TICARET_HUKUKU
                else lawyers[1] if case_type == CaseType.IS_HUKUKU
                else lawyers[2] if case_type == CaseType.KIRA
                else lawyers[index % len(lawyers)]
            )
            case = _get_or_create_case(db, firm, assigned, **case_kwargs)
            if legacy_lawyer and case.assigned_lawyer_id == lawyer.id:
                case.assigned_lawyer_id = assigned.id
            demo_cases[case_kwargs["case_number"]] = case


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

        # The commercial rent case is intentionally richer than the other
        # demo records.  It uses sourced public data and explicitly records
        # the evidence gaps instead of presenting invented listings as
        # same-neighbourhood comparables.
        commercial_rent_case = demo_cases["2026/153"]
        legacy_document = (
            db.query(Document)
            .filter(Document.case_id == commercial_rent_case.id, Document.filename == "emsal-kira-listesi.txt")
            .first()
        )
        if legacy_document and legacy_document.extracted_text == "Aynı bölgede bulunan üç ticari taşınmaza ait örnek kira bedelleri.":
            legacy_document.filename = TICARI_KIRA_DOCUMENTS[0][0]
            legacy_document.extracted_text = TICARI_KIRA_DOCUMENTS[0][1]

        legacy_task = (
            db.query(Task)
            .filter(Task.case_id == commercial_rent_case.id, Task.title == "Emsal kira araştırmasını güncelle")
            .first()
        )
        if legacy_task and legacy_task.description == "Demo görev kaydı":
            legacy_task.description = "Taşınmazın açık adresi ve nitelikleri tamamlandıktan sonra aynı alt pazardan kaynaklı üç emsali TL/m² karşılaştırmasıyla güncelle."

        legacy_event = (
            db.query(CaseEvent)
            .filter(CaseEvent.case_id == commercial_rent_case.id, CaseEvent.title == "Emsal kira araştırması dosyaya eklendi")
            .first()
        )
        if legacy_event and legacy_event.description == "Demo dava gelişmesi":
            legacy_event.description = "İlk emsal notu incelendi; adres, alan ve kaynak bilgisi içermediği için doğrulama bekleyen çalışma olarak işaretlendi."

        for title, description, due_in_days, status in TICARI_KIRA_TASKS:
            _get_or_create_task(
                db,
                commercial_rent_case,
                lawyer,
                title=title,
                description=description,
                due_date=date.today() + timedelta(days=due_in_days),
                status=status,
                completed_at=(datetime.now(timezone.utc) - timedelta(days=1) if status == TaskStatus.COMPLETED else None),
            )

        for index, (filename, extracted_text) in enumerate(TICARI_KIRA_DOCUMENTS):
            _get_or_create_document(
                db,
                commercial_rent_case,
                lawyer,
                filename=filename,
                file_type=DocumentType.TXT,
                extracted_text=extracted_text,
                uploaded_at=datetime.now(timezone.utc) - timedelta(hours=index),
            )

        for title, description, event_type, days_ago in TICARI_KIRA_EVENTS:
            _get_or_create_event(
                db,
                commercial_rent_case,
                lawyer,
                title=title,
                description=description,
                event_type=event_type,
                event_date=date.today() - timedelta(days=days_ago),
                created_at=datetime.now(timezone.utc) - timedelta(hours=days_ago),
            )

        # The detailed overview must not be populated for just one showcase case.
        # These notes are derived only from each case's existing demo fields.
        for case_number, case in demo_cases.items():
            if case_number != "2026/153":
                assigned_lawyer = next((user for user in lawyers if user.id == case.assigned_lawyer_id), lawyer)
                _seed_case_detail(db, case, assigned_lawyer)

        scenario_count = seed_courtroom_scenarios(db)
        showcase_count = sum(seed_courtroom_showcases(db, user) for user in (admin, *lawyers))

        db.commit()
        print(f"Seed complete. Firm: {DEMO_FIRM_NAME}")
        print(f"  Admin login:  {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Lawyer login: {LAWYER_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Demo cases: {len(DEMO_CASES)}")
        print(f"  Demo tasks: {len(DEMO_TASKS) + len(TICARI_KIRA_TASKS) + 3 * len(CASE_EVIDENCE)}")
        print(f"  Demo documents: {len(DEMO_DOCUMENTS) + len(TICARI_KIRA_DOCUMENTS) + 2 * len(CASE_EVIDENCE)}")
        print(f"  Demo activities: {len(DEMO_EVENTS) + len(TICARI_KIRA_EVENTS) + 3 * len(CASE_EVIDENCE)}")
        print(f"  Courtroom scenarios: {scenario_count}")
        print(f"  Completed training hearings: {showcase_count} newly added")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
