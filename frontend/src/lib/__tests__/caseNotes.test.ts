import { describe, expect, it } from "vitest";

import { canChangeNote, noteText, sortNotes } from "@/lib/caseNotes";
import type { CaseEvent } from "@/types";

const note = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "n", event_date: "2026-10-01", title: "Başlık", description: "Başlık\nAyrıntı", event_type: "note",
  created_by: "u-author", created_by_name: "Yazar", created_at: "2026-10-01T09:00:00", ...over,
});

describe("caseNotes", () => {
  it("noteText prefers the full text and falls back to the title of old notes", () => {
    expect(noteText(note({}))).toBe("Başlık\nAyrıntı");
    expect(noteText(note({ description: null }))).toBe("Başlık");
  });

  it("sortNotes puts the newest date first, then the newest written", () => {
    const sorted = sortNotes([
      note({ id: "a", event_date: "2026-09-01" }),
      note({ id: "b", event_date: "2026-10-01", created_at: "2026-10-01T08:00:00" }),
      note({ id: "c", event_date: "2026-10-01", created_at: "2026-10-01T12:00:00" }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("canChangeNote: author, responsible lawyer or admin", () => {
    expect(canChangeNote({ id: "u-author", role: "lawyer" }, "u-owner", note({}))).toBe(true);
    expect(canChangeNote({ id: "u-owner", role: "lawyer" }, "u-owner", note({}))).toBe(true);
    expect(canChangeNote({ id: "u-admin", role: "admin" }, null, note({}))).toBe(true);
    expect(canChangeNote({ id: "u-other", role: "lawyer" }, "u-owner", note({}))).toBe(false);
    expect(canChangeNote({ id: "u-other", role: "lawyer" }, null, note({ created_by: null }))).toBe(false);
    expect(canChangeNote(null, "u-owner", note({}))).toBe(false);
  });
});
