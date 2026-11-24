"""The site cat's only source: site-knowledge.md next to this module.

The backend image is built from backend/ alone, so the file lives here rather
than in web-page/. Lines marked "TODO:" are facts nobody has confirmed yet;
the prompt turns them into explicit "unknown" markers so the model never
fills them in.
"""
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

KNOWLEDGE_PATH = Path(__file__).with_name("site-knowledge.md")
BOOKING_URL = "https://calendar.app.google/RL4CxQFEZAuVF2xP9"
UNKNOWN_MARKER = "BİLİNMİYOR (bu konuda bilgi verme, demo bağlantısını öner):"

_VERSION = re.compile(r"<!--\s*site-knowledge version:\s*([^\s]+)\s*-->")
_HEADING = re.compile(r"^##\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$")


@dataclass(frozen=True)
class Section:
    id: str
    title: str
    text: str  # markdown body without TODO lines


@dataclass(frozen=True)
class Knowledge:
    version: str
    prompt_text: str  # whole file, TODO lines rewritten as unknown markers
    sections: dict[str, Section]
    todos: tuple[str, ...]


@lru_cache(maxsize=1)
def load_knowledge(path: Path = KNOWLEDGE_PATH) -> Knowledge:
    raw = path.read_text(encoding="utf-8")
    match = _VERSION.search(raw)
    if not match:
        raise RuntimeError("site-knowledge.md has no version comment")
    todos: list[str] = []
    prompt_lines: list[str] = []
    sections: dict[str, Section] = {}
    current_id = current_title = None
    body: list[str] = []

    def close():
        if current_id:
            sections[current_id] = Section(current_id, current_title, "\n".join(body).strip())

    for line in raw.splitlines():
        if line.startswith("<!--"):
            continue
        stripped = line.strip()
        todo = re.match(r"^-?\s*TODO:\s*(.+)$", stripped)
        if todo:
            todos.append(todo.group(1))
            prompt_lines.append(f"- {UNKNOWN_MARKER} {todo.group(1)}")
            continue
        heading = _HEADING.match(stripped)
        if heading:
            close()
            current_title, current_id, body = heading.group(1), heading.group(2), []
            prompt_lines.append(f"## {current_title}")
            continue
        prompt_lines.append(line)
        if current_id:
            body.append(line)
    close()
    return Knowledge(match.group(1), "\n".join(prompt_lines).strip(), sections, tuple(todos))
