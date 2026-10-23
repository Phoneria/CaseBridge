import { afterEach, describe, expect, it, vi } from "vitest";

import { lastCaseListHref, rememberCaseListHref } from "@/lib/caseListMemory";

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("caseListMemory", () => {
  it("returns the last remembered list URL", () => {
    rememberCaseListHref("/davalar?durum=aktif&avukat=u1");
    expect(lastCaseListHref()).toBe("/davalar?durum=aktif&avukat=u1");
  });

  it("falls back to /davalar when nothing or something foreign is stored", () => {
    expect(lastCaseListHref()).toBe("/davalar");
    window.sessionStorage.setItem("casebridge:lastCaseListHref", "https://evil.example/davalar");
    expect(lastCaseListHref()).toBe("/davalar");
    rememberCaseListHref("/gorevler");
    expect(lastCaseListHref()).toBe("/davalar");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => rememberCaseListHref("/davalar?ara=x")).not.toThrow();
    expect(lastCaseListHref()).toBe("/davalar");
  });
});
