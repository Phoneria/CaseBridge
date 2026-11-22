/** Pure helpers for the knowledge map: search normalisation, neighbour sets and a deterministic force layout. */
import type { GraphEdge, GraphNode } from "@/types/legalLab";

/** "HMK 190", "hmk m.190", "m190" -> "hmk190": lets people type the article the way they say it. */
export function normaliseQuery(q: string): string {
  return q
    .toLocaleLowerCase("tr-TR")
    .replace(/s\.\s*k\./g, "")
    .replace(/[\s.\-_/]+/g, "")
    .replace(/m(?=\d)/g, "");
}

export function nodeKey(n: GraphNode): string {
  return normaliseQuery(`${n.code}`) + "|" + normaliseQuery(`${n.law} ${n.art}`) + "|" + normaliseQuery(`${n.no ?? ""}${n.art}`);
}

export function searchNodes(nodes: GraphNode[], q: string): GraphNode[] {
  const raw = q.trim();
  if (!raw) return [];
  const nq = normaliseQuery(raw);
  const text = raw.toLocaleLowerCase("tr-TR");
  return nodes
    .filter((n) => (nq && nodeKey(n).includes(nq)) || (n.title ?? "").toLocaleLowerCase("tr-TR").includes(text))
    .sort((a, b) => b.tot - a.tot)
    .slice(0, 8);
}

export function neighbours(id: string, edges: GraphEdge[]): Map<string, GraphEdge> {
  const out = new Map<string, GraphEdge>();
  for (const e of edges) {
    if (e.s === id) out.set(e.t, e);
    else if (e.t === id) out.set(e.s, e);
  }
  return out;
}

export interface Pos {
  x: number;
  y: number;
}

/** Deterministic layout: laws are seeded around a ring, articles around their law, then a short force relaxation. */
export function layout(nodes: GraphNode[], edges: GraphEdge[], width = 1000, height = 700): Map<string, Pos> {
  const laws = [...new Set(nodes.map((n) => n.law))].sort();
  const cx = width / 2;
  const cy = height / 2;
  const pos = new Map<string, Pos>();
  const vel = new Map<string, Pos>();
  const lawAngle = new Map(laws.map((l, i) => [l, (i / laws.length) * Math.PI * 2]));
  const byLaw = new Map<string, GraphNode[]>();
  nodes.forEach((n) => byLaw.set(n.law, [...(byLaw.get(n.law) ?? []), n]));
  byLaw.forEach((list, law) => {
    const a = lawAngle.get(law)!;
    const hx = cx + Math.cos(a) * width * 0.4;
    const hy = cy + Math.sin(a) * height * 0.4;
    list.forEach((n, i) => {
      const r = 24 + Math.sqrt(i + 1) * 30;
      const t = i * 2.399963;
      pos.set(n.id, { x: hx + Math.cos(t) * r, y: hy + Math.sin(t) * r });
      vel.set(n.id, { x: 0, y: 0 });
    });
  });
  const radius = (n: GraphNode) => nodeRadius(n) + 5;
  const home = (n: GraphNode): Pos => {
    const a = lawAngle.get(n.law)!;
    return { x: cx + Math.cos(a) * width * 0.4, y: cy + Math.sin(a) * height * 0.4 };
  };
  for (let it = 0; it < 300; it++) {
    const cool = 1 - it / 320;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const pa = pos.get(a.id)!;
      const va = vel.get(a.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const pb = pos.get(b.id)!;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const min = radius(a) + radius(b);
        if (d2 < min * min * 16) {
          const d = Math.sqrt(d2);
          const f = ((min * 4) / d - 1) * 0.07;
          dx /= d;
          dy /= d;
          va.x -= dx * f * 14;
          va.y -= dy * f * 14;
          const vb = vel.get(b.id)!;
          vb.x += dx * f * 14;
          vb.y += dy * f * 14;
        }
      }
      const h = home(a);
      va.x += (h.x - pa.x) * 0.004;
      va.y += (h.y - pa.y) * 0.004;
    }
    for (const e of edges) {
      const pa = pos.get(e.s);
      const pb = pos.get(e.t);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 70) * 0.012 * Math.min(2, 0.5 + e.j);
      vel.get(e.s)!.x += (dx / d) * f;
      vel.get(e.s)!.y += (dy / d) * f;
      vel.get(e.t)!.x -= (dx / d) * f;
      vel.get(e.t)!.y -= (dy / d) * f;
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      p.x += Math.max(-12, Math.min(12, v.x)) * cool;
      p.y += Math.max(-12, Math.min(12, v.y)) * cool;
      v.x = 0;
      v.y = 0;
    }
  }
  return pos;
}

export function nodeRadius(n: GraphNode): number {
  return Math.min(22, 6.5 + Math.sqrt(n.n) * 0.9);
}

const PALETTE = ["#007eac", "#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf", "#0e7490", "#9a3412"];
export function lawColor(law: string, laws: string[]): string {
  const i = Math.max(0, laws.indexOf(law));
  return PALETTE[i % PALETTE.length];
}
