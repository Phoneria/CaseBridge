import { describe, expect, it } from "vitest";

import { formatOdak, parseOdak, withParams } from "@/lib/urlState";

describe("parseOdak", () => {
  it("parses valid focus values", () => {
    expect(parseOdak("gorev:t1")).toEqual({ type: "gorev", id: "t1" });
    expect(parseOdak("belge:abc-123")).toEqual({ type: "belge", id: "abc-123" });
    expect(formatOdak({ type: "olay", id: "e1" })).toBe("olay:e1");
  });

  it("rejects malformed focus values", () => {
    expect(parseOdak(null)).toBeNull();
    expect(parseOdak("gorev")).toBeNull();
    expect(parseOdak("gorev:")).toBeNull();
    expect(parseOdak("dosya:1")).toBeNull();
  });
});

describe("withParams", () => {
  it("adds, replaces and removes keys while keeping the rest", () => {
    const current = new URLSearchParams("kategori=icra&onizle=c1&odak=gorev%3At1");
    expect(withParams("/davalar", current, { onizle: null, odak: null })).toBe("/davalar?kategori=icra");
    expect(withParams("/davalar", current, { onizle: "c2" })).toBe("/davalar?kategori=icra&onizle=c2&odak=gorev%3At1");
    expect(withParams("/davalar", new URLSearchParams(), { ara: "" })).toBe("/davalar");
  });
});
