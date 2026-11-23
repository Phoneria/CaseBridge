"""Evidence and competing decisions in a single fictional matter."""
from app.db.dossier_documents import entries
from app.db.dossier_exhibits import EXHIBITS
from app.db.dossier_pack import document_key
from app.legal_lab.dossier_decisions import DECISIONS
from app.legal_lab.dossier_forks import FORKS
from app.legal_lab.scenario_tree import TreeNode


def history_nodes(case_id, story, sources):
    available = {s.id for s in sources if s.kind == "document"}
    documents = entries(story)[1:]
    by_title = {doc.title: doc for doc in documents}

    def refs(*titles):
        ids = []
        for title in titles:
            if title in by_title:
                ref = "document:" + document_key(case_id, by_title[title].key)
                if ref in available and ref not in ids:
                    ids.append(ref)
        return ids or ["case"]

    recorded_title, alternatives = DECISIONS[story.code]
    exhibits = EXHIBITS[story.code]
    evidence = refs(*(title for title, _, _ in exhibits))
    root = TreeNode(id="root", parent_id=None, kind="context", label=story.title,
                    description=story.facts, reasoning=story.claim, source_ids=refs("İlk görüşme tutanağı"),
                    uncertainties=[], path_percent=100)
    nodes = [root]

    forks = FORKS[story.code]
    continuation = {}
    for fork in forks:
        continuation[fork.stage] = continuation.get(fork.stage, 100) - fork.percent

    def add(parent, key, label, description, reason, sources, *, recorded=True, terminal=False, weight=None):
        if weight is None:
            weight = continuation.get(parent.id, 100)
        node = TreeNode(id=key, parent_id=parent.id, kind="outcome" if terminal else "development",
                        label=label, description=description, reasoning=reason, source_ids=sources,
                        uncertainties=[], transition_percent=weight,
                        path_percent=parent.path_percent * weight / 100, recorded_step=recorded)
        nodes.append(node)
        return node

    claim = add(root, "filing", story.claim, story.facts, story.claim,
                refs("İlk görüşme tutanağı", "Dava dilekçesi", "Şikâyet ve delil dilekçesi"))
    issue = add(claim, "dispute", story.response, story.claim, story.response,
                refs("Cevap dilekçesi", "Şikâyet ve delil dilekçesi", "İlk görüşme tutanağı"))

    # The alternatives diverge before the evidence has been evaluated. They
    # reference what would be tested, never cite the recorded verdict as proof.
    sequence = int(story.code[1:])
    shares = [48 + sequence, 31 - sequence // 2]
    shares.append(100 - sum(shares))
    parent = issue
    for i, (title, author, content) in enumerate(exhibits):
        if story.code == "C10" and i == 1:
            parent = add(parent, "initial-kyok", "İlk görüntü üzerine KYOK verildi",
                         "İlk görüntü tehdidin bağlamını göstermedi.", "İtiraz için konuşmanın eksik kısmı arandı.",
                         refs("Kovuşturmaya yer olmadığına dair karar"))
        parent = add(parent, f"exhibit-{i}", title, content,
                     f"{story.claim} Bu husus için {author} kaydı incelendi.", refs(title),
                     weight=shares[0] if i == 0 else 100)
    parent = add(parent, "evidence", "Olay ve dayanak kayıtlar", story.exhibit,
                 f"{story.response} Bu açıklamayı sınamak için {story.exhibit} birlikte incelendi.", evidence)
    parent = add(parent, "finding", story.finding, story.finding, story.exhibit, evidence)
    challenge_docs = [d.title for d in documents
                      if any(word in d.title.casefold() for word in ("beyan", "savunma", "itiraz"))]
    parent = add(parent, "challenge", story.challenge, story.challenge, story.finding,
                 refs(*challenge_docs) if challenge_docs else evidence)
    judgment_docs = [d.title for d in documents if d.title in (
        "Gerekçeli karar", "Kovuşturmaya yer olmadığına dair karar", "Uzlaştırma üzerine KYOK")]
    parent = add(parent, "decision", story.judgment, story.judgment, story.finding, refs(*judgment_docs))
    # Keep each appeal at the level at which it actually occurred.
    for doc in documents:
        if doc.title in ("Bölge Adliye Mahkemesi kararı", "Yargıtay kararı", "AYM bireysel başvuru kararı",
                         "Yeniden yargılama gerekçeli kararı", "AİHM kabul edilebilirlik kararı"):
            body = doc.text.split("\n\nDosyada başvurulan evrak")[0].split("\n\n", 4)[-1]
            parent = add(parent, doc.key, doc.title, body, story.challenge, refs(doc.title))
    add(parent, "recorded", recorded_title, f"{story.claim}\n\n{story.judgment}\n\n{story.end}",
        story.finding, refs(documents[-1].title, *judgment_docs), terminal=True)

    for i, path in enumerate(alternatives, 1):
        parent = issue
        for j, label in enumerate(path):
            terminal = j == len(path) - 1
            description = f"{story.claim}\n\n{path.decision}" if terminal else f"{story.title} · {label}"
            reason = path.reason if terminal else (path[j - 1] if j else story.response)
            parent = add(parent, f"alternative-{i}-{j}", label, description, reason, evidence,
                         recorded=False, terminal=terminal, weight=shares[i] if j == 0 else None)
    stages = {n.id: n for n in nodes}
    for index, fork in enumerate(forks):
        parent = stages[fork.stage]
        key = f"{fork.stage}-exhibit-fork-{index}"
        source_ids = refs(fork.exhibit)
        finding = add(parent, key, fork.finding, f"{story.title} · {fork.finding}",
                      f"{fork.exhibit} bu varsayım altında değerlendirilir. {fork.reason}",
                      source_ids, recorded=False, weight=fork.percent)
        add(finding, f"{key}-decision", fork.decision, f"{story.claim}\n\n{fork.decision}",
            fork.reason, source_ids, recorded=False, terminal=True)
    return nodes
