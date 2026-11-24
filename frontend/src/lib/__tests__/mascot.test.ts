import { describe, expect, it } from "vitest";

import {
  INITIAL_MASCOT_STATE,
  MASCOT_MARGIN,
  MASCOT_MODES,
  VARIANT_GAP_MS,
  canPlayVariant,
  caseIdFromPath,
  clampPosition,
  defaultPosition,
  mascotImage,
  mascotMode,
  mascotReducer,
  pageModeFor,
  parsePosition,
  positionLeft,
  snapPosition,
  type MascotEvent,
  type MascotState,
} from "@/lib/mascot";

function run(...events: MascotEvent[]): MascotState {
  return events.reduce(mascotReducer, INITIAL_MASCOT_STATE);
}

describe("mascot mode state machine", () => {
  it("starts idle and follows a chat turn: thinking, researching, working, idle", () => {
    expect(mascotMode(INITIAL_MASCOT_STATE)).toBe("idle");
    expect(mascotMode(run({ type: "send" }))).toBe("thinking");
    expect(mascotMode(run({ type: "send" }, { type: "tool" }))).toBe("researching");
    expect(mascotMode(run({ type: "send" }, { type: "tool" }, { type: "delta" }))).toBe("working");
    expect(mascotMode(run({ type: "send" }, { type: "delta" }, { type: "finish" }))).toBe("idle");
  });

  it("ignores stray stream events when no question is pending", () => {
    expect(run({ type: "tool" })).toEqual(INITIAL_MASCOT_STATE);
    expect(run({ type: "delta" })).toEqual(INITIAL_MASCOT_STATE);
  });

  it("sleeps after the idle timeout, wakes on activity, and never sleeps mid-answer", () => {
    expect(mascotMode(run({ type: "idle-timeout" }))).toBe("sleeping");
    expect(mascotMode(run({ type: "idle-timeout" }, { type: "activity" }))).toBe("idle");
    expect(mascotMode(run({ type: "send" }, { type: "idle-timeout" }))).toBe("thinking");
    expect(mascotMode(run({ type: "idle-timeout" }, { type: "send" }, { type: "finish" }))).toBe("idle");
  });

  it("uses page poses, with chat activity and victory taking priority", () => {
    expect(mascotMode(run({ type: "page", page: "reading" }))).toBe("reading");
    expect(mascotMode(run({ type: "page", page: "courtroom" }))).toBe("courtroom");
    expect(mascotMode(run({ type: "page", page: "courtroom" }, { type: "send" }))).toBe("thinking");
    expect(mascotMode(run({ type: "page", page: "reading" }, { type: "case-won" }))).toBe("victory");
    expect(mascotMode(run({ type: "case-won" }, { type: "victory-end" }))).toBe("idle");
    expect(mascotMode(run({ type: "page", page: "reading" }, { type: "idle-timeout" }))).toBe("reading");
  });

  it("plays a rare idle variant at most once every ten minutes", () => {
    const first = run({ type: "variant", variant: "tea-break", now: 1_000 });
    expect(mascotMode(first)).toBe("tea-break");
    const ended = mascotReducer(first, { type: "variant-end" });
    expect(mascotMode(ended)).toBe("idle");
    const tooSoon = mascotReducer(ended, { type: "variant", variant: "dancing", now: 1_000 + VARIANT_GAP_MS - 1 });
    expect(mascotMode(tooSoon)).toBe("idle");
    const later = mascotReducer(ended, { type: "variant", variant: "dancing", now: 1_000 + VARIANT_GAP_MS });
    expect(mascotMode(later)).toBe("dancing");
  });

  it("allows no variant while busy, asleep, celebrating or on a posed page", () => {
    expect(canPlayVariant(run({ type: "send" }), 0)).toBe(false);
    expect(canPlayVariant(run({ type: "idle-timeout" }), 0)).toBe(false);
    expect(canPlayVariant(run({ type: "case-won" }), 0)).toBe(false);
    expect(canPlayVariant(run({ type: "page", page: "reading" }), 0)).toBe(false);
    expect(canPlayVariant(INITIAL_MASCOT_STATE, 0)).toBe(true);
    expect(mascotMode(run({ type: "variant", variant: "dancing", now: 0 }, { type: "send" }))).toBe("thinking");
  });

  it("maps every mode to its transparent WebP assets", () => {
    expect(MASCOT_MODES).toHaveLength(10);
    expect(mascotImage("tea-break", 256)).toBe("/mascot/cat-tea-break@256.webp");
  });
});

describe("page detection", () => {
  it("detects document and Canlı Duruşma pages and case ids", () => {
    expect(pageModeFor("/belgeler")).toBe("reading");
    expect(pageModeFor("/davalar/c1", "sekme=belgeler")).toBe("reading");
    expect(pageModeFor("/davalar/c1", "sekme=gorevler")).toBe("none");
    expect(pageModeFor("/ai/durusma")).toBe("courtroom");
    expect(pageModeFor("/ai/durusma/oturum")).toBe("courtroom");
    expect(pageModeFor("/dashboard")).toBe("none");
    expect(caseIdFromPath("/davalar/abc-123")).toBe("abc-123");
    expect(caseIdFromPath("/davalar/yeni")).toBeNull();
    expect(caseIdFromPath("/davalar")).toBeNull();
  });
});

describe("position", () => {
  const viewport = { width: 1200, height: 800 };
  const size = 80;

  it("snaps to the nearest side and stays inside the viewport", () => {
    expect(snapPosition(100, 300, viewport, size)).toEqual({ side: "left", top: 300 });
    expect(snapPosition(700, 300, viewport, size)).toEqual({ side: "right", top: 300 });
    expect(snapPosition(500, -50, viewport, size)).toEqual({ side: "left", top: MASCOT_MARGIN });
    expect(snapPosition(900, 5000, viewport, size)).toEqual({ side: "right", top: 800 - size - MASCOT_MARGIN });
    expect(positionLeft({ side: "left", top: 0 }, viewport, size)).toBe(MASCOT_MARGIN);
    expect(positionLeft({ side: "right", top: 0 }, viewport, size)).toBe(1200 - size - MASCOT_MARGIN);
  });

  it("re-clamps a saved position after the window shrinks", () => {
    expect(clampPosition({ side: "right", top: 700 }, { width: 400, height: 500 }, size)).toEqual({ side: "right", top: 500 - size - MASCOT_MARGIN });
    expect(defaultPosition(viewport, size)).toEqual({ side: "right", top: 800 - size - 2 * MASCOT_MARGIN });
  });

  it("reads only a well-formed saved position", () => {
    expect(parsePosition('{"side":"left","top":120}')).toEqual({ side: "left", top: 120 });
    expect(parsePosition('{"side":"up","top":120}')).toBeNull();
    expect(parsePosition("not json")).toBeNull();
    expect(parsePosition(null)).toBeNull();
  });
});
