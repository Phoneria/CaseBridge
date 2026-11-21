import { describe, expect, it } from "vitest";

import { layout, neighbours, normaliseQuery, searchNodes } from "@/lib/graphLayout";
import type { GraphEdge, GraphNode } from "@/types/legalLab";

const node = (id: string, law: string, no: string, art: string, title: string, tot = 50): GraphNode => ({
  id, code: `${law} m.${art}`, law, no, law_name: law, art, title, text: "", n: tot, tot, boz: 0.5, base: 0.4, lift: 1.2, ex: [],
});
const nodes = [node("6100:190", "HMK", "6100", "190", "İspat yükü"), node("6100:114", "HMK", "6100", "114", "Dava şartları"), node("6098:97", "TBK", "6098", "97", "Ödemezlik defi")];
const edges: GraphEdge[] = [{ s: "6100:190", t: "6100:114", w: 9, j: 0.5 }];

describe("graph helpers", () => {
  it("normalises how people type articles", () => {
    expect(normaliseQuery("HMK 190")).toBe("hmk190");
    expect(normaliseQuery("hmk m.190")).toBe("hmk190");
  });
  it("finds by code, number or title", () => {
    expect(searchNodes(nodes, "HMK 190")[0].id).toBe("6100:190");
    expect(searchNodes(nodes, "6098 97")[0].id).toBe("6098:97");
    expect(searchNodes(nodes, "ödemezlik")[0].id).toBe("6098:97");
    expect(searchNodes(nodes, "")).toEqual([]);
  });
  it("returns neighbours from either end of an edge", () => {
    expect([...neighbours("6100:114", edges).keys()]).toEqual(["6100:190"]);
  });
  it("lays out every node deterministically inside a sane box", () => {
    const a = layout(nodes, edges);
    const b = layout(nodes, edges);
    expect(a.size).toBe(3);
    expect(a.get("6100:190")).toEqual(b.get("6100:190"));
    for (const p of a.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThan(3000);
    }
  });
});
