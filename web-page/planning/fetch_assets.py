from __future__ import annotations

import urllib.request
from pathlib import Path

assets = Path(__file__).resolve().parent.parent / 'assets'
sources = {
    'attorney-meeting-source.jpg': 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Attorney_meets_with_client_for_estate_planning.jpg',
    'world-source.svg': 'https://raw.githubusercontent.com/melenaos/Menelabs.VectorAtlas/main/dist/world.svg',
}
for name, url in sources.items():
    req = urllib.request.Request(url, headers={'User-Agent': 'CaseBridge local website project/1.0 (media attribution in README)'})
    data = urllib.request.urlopen(req, timeout=30).read()
    (assets / name).write_bytes(data)
    print(name, len(data))
