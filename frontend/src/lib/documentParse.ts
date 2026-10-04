export type DocOutcome = "bozma" | "onama" | "kaldirma" | "red" | null;

export interface DocSection {
  id: string;
  title: string;
  lines: string[];
}

export interface ParsedDocument {
  meta: { label: string; value: string }[];
  preamble: string[];
  sections: DocSection[];
  outcome: DocOutcome;
  decisionDate: string | null;
  wordCount: number;
  readingMinutes: number;
}

const HEADING = /^([IVX]+)\.\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s]{2,60}?)(?::\s*(.*))?$/;
const META = /^((?:İLK DERECE )?MAHKEMESİ|SAYISI|DAVACI|DAVALI|DAVA TÜRÜ|DAVA TARİHİ|KARAR TARİHİ)\s*:\s*(.+)$/;

export const OUTCOME_LABELS: Record<Exclude<DocOutcome, null>, string> = {
  bozma: "Bozma",
  onama: "Onama",
  kaldirma: "Kaldırma",
  red: "Ret",
};

export function parseDocument(text: string | null): ParsedDocument {
  const raw = (text ?? "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const meta: { label: string; value: string }[] = [];
  const preamble: string[] = [];
  const sections: DocSection[] = [];
  let current: DocSection | null = null;

  for (const line of lines) {
    const h = line.match(HEADING);
    if (h) {
      current = { id: `bolum-${sections.length + 1}`, title: `${h[1]}. ${h[2].trim()}`, lines: [] };
      if (h[3]) current.lines.push(h[3]);
      sections.push(current);
      continue;
    }
    if (!current) {
      const m = line.match(META);
      if (m && meta.length < 8) {
        meta.push({ label: titleCase(m[1]), value: m[2].trim() });
        continue;
      }
      preamble.push(line);
    } else {
      current.lines.push(line);
    }
  }

  const tail = (sections.at(-1)?.lines.join(" ") ?? raw.slice(-1500)).toLocaleUpperCase("tr");
  let outcome: DocOutcome = null;
  if (tail.includes("BOZULMASINA")) outcome = "bozma";
  else if (tail.includes("ONANMASINA")) outcome = "onama";
  else if (tail.includes("KALDIRILMASINA")) outcome = "kaldirma";
  else if (tail.includes("REDDİNE")) outcome = "red";

  const dates = raw.match(/\b\d{2}\.\d{2}\.\d{4}\b/g);
  const words = raw.split(/\s+/).filter(Boolean).length;

  return {
    meta,
    preamble,
    sections,
    outcome,
    decisionDate: dates ? dates[dates.length - 1] : null,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

function titleCase(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .split(" ")
    .map((w) => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1))
    .join(" ");
}

/** Splits text into plain / match segments (Turkish case-insensitive). */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return [{ text, match: false }];
  const lower = text.toLocaleLowerCase("tr");
  const out: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) break;
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), match: false });
  return out;
}
