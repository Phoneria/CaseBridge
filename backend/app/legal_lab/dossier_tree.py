"""A rehearsal of the seven decisions in a fictional case, grounded in its exhibits."""
from app.db.dossier_documents import entries
from app.db.dossier_exhibits import EXHIBITS
from app.db.dossier_pack import document_key
from app.legal_lab.scenario_tree import TreeNode


def history_nodes(case_id, story, sources):
    available = {s.id for s in sources if s.kind == "document"}
    documents = entries(story)
    exhibits = {title for title, _, _ in EXHIBITS[story.code]}
    criminal = story.code.startswith("C")
    # Each fork describes what next action the team would take, not an empirical
    # frequency or a probability inferred from the recorded judgment.
    phases = [
        ("intake", "İlk görüşme tutanağı", story.facts, ("görüşme",),
         ("Olay tarihleri eksik", "Kronoloji müvekkille tamamlanır", "Tarihleri belirsiz işlemler ayrılır"),
         ("Taraf kimliği belirsiz", "Yetkili temsilci doğrulanır", "Başvuru kimlik teyidine bırakılır")),
        ("mandate", "Müvekkilin talebi ve temsil yetkisi", story.claim, ("vekâlet", "olay özeti"),
         ("Talep kapsamı değişir", "Yeni istem yazılı onaya sunulur", "İlk talep ile devam edilir"),
         ("Yetki belgesi eksik", "Belge tamamlanıp kapsam incelenir", "Temsil işlemi beklemeye alınır")),
        ("filing", "Şikâyet ve soruşturma" if criminal else "Dava dilekçesi ve cevap", story.claim,
         ("şikâyet", "şikayet", "dava dilekçesi", "cevap dilekçesi", "iddianame"),
         ("Başvurunun dayanağı tartışılır", "Başvuru ekleri tamamlanır", "Talep kapsamı daraltılır"),
         ("Karşı anlatım sunulur", "Beyanlara yazılı yanıt hazırlanır", "Çekişmesiz hususlar belirlenir")),
        ("evidence", "Olay ve dayanak kayıtlar", story.exhibit, ("delil", "raporu", "keşif", "müzekkere"),
         ("Kaydın aslı tartışılır", "Kurumdan aslı istenir", "Diğer delillerle karşılaştırılır"),
         ("Kayıtlar farklı tarihler gösterir", "Zaman çizelgesi yeniden kurulur", "Tarih uyuşmazlığı için ek görüş alınır")),
        ("dispute", "Tartışılan husus", story.challenge, ("itiraz", "beyan", "savunma", "tutanak", "duruşma"),
         ("Karşı tarafın açıklaması güçlenir", "Destekleyen beyanlar incelenir", "Çelişen belgeler tek tek yanıtlanır"),
         ("İnceleme eksik kalır", "Tamamlayıcı araştırma talep edilir", "Mevcut kayıtlarla karar istenir")),
        ("decision", "İlk karar ve gerekçesi", story.judgment, ("gerekçeli karar", "kyok", "uzlaş", "kovuşturma"),
         ("Gerekçe tartışmalı bulunur", "Dayanak belgeler kararla eşleştirilir", "Karşı görüş müvekkile sunulur"),
         ("Kararın kapsamı belirsizdir", "Hüküm bölümleri ayrı değerlendirilir", "Tebliğ ve karar nüshası karşılaştırılır")),
        ("recorded", "Gerçekleşen sonuç", story.end, ("karar", "kapanış", "itiraz", "kesinleş", "uzlaş"),
         ("Başvuru yolu incelenir", "Başvurunun koşulları ve evrakı incelenir", "Başvurmama talimatı dosyalanır"),
         ("Yeni bir işlem gündeme gelir", "İşlemin dayanağı ayrıca değerlendirilir", "Kapanış raporuna takip notu düşülür")),
    ]
    appeal_steps = [
        ("appeal", "İstinaf incelemesi", ("istinaf", "bölge adliye"), "appeal"),
        ("cassation", "Temyiz incelemesi", ("temyiz", "yargıtay"), "cassation"),
        ("constitutional", "Bireysel başvuru", ("bireysel başvuru", "yeniden yargılama"), "constitutional"),
        ("echr", "AİHM incelemesi", ("ai̇hm", "aihm", "kabul edilebilirlik"), "echr"),
    ]
    for key, label, terms, flag in appeal_steps:
        if flag in story.route.split():
            phases.insert(-1, (key, label, story.end, terms,
                ("İnceleme kapsamı tartışılır", "Başvuru nedenleri belgelerle eşleştirilir", "Kapsam itirazına cevap hazırlanır"),
                ("Ek açıklama istenir", "İlgili evrak inceleme merciine sunulur", "Mevcut dosya üzerinden inceleme istenir")))
    # Editorial weights for the rehearsal, grouped by decision, with exclusive sibling paths.
    weights = {"intake": (80, 12, 8), "mandate": (85, 10, 5), "filing": (70, 18, 12),
               "evidence": (55, 25, 20), "dispute": (52, 28, 20), "decision": (60, 25, 15),
               "appeal": (60, 22, 18), "cassation": (58, 24, 18), "constitutional": (53, 27, 20),
               "echr": (51, 29, 20), "recorded": (75, 15, 10)}
    root = TreeNode(id="root", parent_id=None, kind="context", label=story.title,
                    description=story.facts, reasoning="Müvekkilin ilk anlatımından dosyanın kapanışına.",
                    source_ids=["case"], uncertainties=[], path_percent=100)
    nodes = [root]
    parent = root
    for key, label, detail, terms, first, second in phases:
        refs = ["document:" + document_key(case_id, d.key) for d in documents[1:]
                if any(t in d.title.replace("İ", "i").lower() for t in terms) or (key == "evidence" and d.title in exhibits)]
        refs = [r for r in refs if r in available]
        if not refs and key not in ("decision", "recorded"):
            refs = [source for source in ("document:" + document_key(case_id, e.key) for e in documents
                                          if e.title in exhibits) if source in available]
        if not refs and key in ("decision", "recorded"):
            refs = [r for r in ["document:" + document_key(case_id, documents[-1].key)] if r in available]
        def add(node_id, predecessor, name, description, percent, historical=False):
            node = TreeNode(id=node_id, parent_id=predecessor.id, kind="outcome" if key == "recorded" or not historical else "development",
                            label=name, description=description, source_ids=refs, uncertainties=[],
                            reasoning=detail, transition_percent=percent, path_percent=predecessor.path_percent * percent / 100,
                            recorded_step=historical)
            nodes.append(node)
            return node
        recorded_weight, first_weight, second_weight = weights[key]
        main = add(key, parent, label, detail, recorded_weight, True)
        for number, (alternative, weight) in enumerate(((first, first_weight), (second, second_weight)), 1):
            fork = add(f"{key}-alt-{number}", parent, alternative[0], f"{label} aşamasında değerlendirilebilecek alternatif. {detail}", weight)
            for option, chance in enumerate((60, 40), 1):
                add(f"{fork.id}-{option}", fork, alternative[option], f"{alternative[0]}. İncelenecek husus: {detail}", chance)
        parent = main
    return nodes
