import { describe, expect, it } from "vitest";

import {
  analyticsCaseListHref,
  caseDetailHref,
  caseListHref,
  daysUntil,
  describeCaseListQuery,
  filterDocuments,
  filterTasks,
  parseCalendarQuery,
  parseCaseListQuery,
  parseCaseTab,
  parseDocumentListQuery,
  parseTaskListQuery,
  sortTasks,
  taskListHref,
  toCaseListFilters,
} from "@/lib/filters";
import type { DocumentWithCase, TaskWithCase } from "@/types";

const TODAY = new Date(2026, 8, 30); // 30 Sep 2026, local time

function task(overrides: Partial<TaskWithCase>): TaskWithCase {
  return {
    id: "t",
    case_id: "c1",
    case_name: "Dava",
    case_number: "2026/1",
    title: "Görev",
    description: null,
    due_date: null,
    status: "pending",
    assigned_to: null,
    created_at: "2026-01-01",
    completed_at: null,
    ...overrides,
  };
}

describe("case list query", () => {
  it("round-trips through the URL", () => {
    const href = caseListHref({ kategori: "icra", sonuc: "kazanilan", arsiv: "dahil" });
    expect(href).toBe("/davalar?kategori=icra&sonuc=kazanilan&arsiv=dahil");
    const parsed = parseCaseListQuery(new URLSearchParams(href.split("?")[1]));
    expect(parsed).toEqual({ kategori: "icra", sonuc: "kazanilan", arsiv: "dahil" });
  });

  it("drops unknown values instead of passing them to the API", () => {
    const parsed = parseCaseListQuery(new URLSearchParams("kategori=uzay&durum=bilinmiyor&sonuc=x&ara=%20%20"));
    expect(parsed).toEqual({});
  });

  it("maps URL slugs to API filters", () => {
    expect(toCaseListFilters({ ara: "kira", kategori: "kira", durum: "aktif", sonuc: "kaybedilen", durusma: "yaklasan", arsiv: "dahil" })).toEqual({
      search: "kira",
      case_type: "kira",
      active: true,
      outcome: "lost",
      hearing_within_days: 30,
      include_archived: true,
    });
    expect(toCaseListFilters({ durum: "kapali" })).toEqual({ status: "kapali" });
    expect(toCaseListFilters({})).toEqual({});
  });

  it("always adds arsiv=dahil to analytics links", () => {
    expect(analyticsCaseListHref({ durum: "aktif" })).toBe("/davalar?durum=aktif&arsiv=dahil");
    expect(analyticsCaseListHref()).toBe("/davalar?arsiv=dahil");
  });

  it("describes active filters as Turkish chips", () => {
    expect(describeCaseListQuery({ kategori: "icra", durum: "aktif", arsiv: "dahil" })).toEqual([
      { key: "kategori", label: "Kategori: İcra" },
      { key: "durum", label: "Durum: Aktif" },
      { key: "arsiv", label: "Arşiv dahil" },
    ]);
  });
});

describe("task list query", () => {
  it("parses and builds links", () => {
    expect(parseTaskListQuery(new URLSearchParams("durum=acik&vade=gecikmis&dava=c9"))).toEqual({ durum: "acik", vade: "gecikmis", dava: "c9" });
    expect(taskListHref({ durum: "acik" })).toBe("/gorevler?durum=acik");
  });

  it("filters overdue and due-this-week tasks relative to today", () => {
    const overdue = task({ id: "a", due_date: "2026-09-29" });
    const dueToday = task({ id: "b", due_date: "2026-09-30" });
    const inAWeek = task({ id: "c", due_date: "2026-10-07" });
    const later = task({ id: "d", due_date: "2026-10-08" });
    const doneOverdue = task({ id: "e", due_date: "2026-09-01", status: "completed" });
    const all = [overdue, dueToday, inAWeek, later, doneOverdue];

    expect(filterTasks(all, { vade: "gecikmis" }, TODAY).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(all, { vade: "7gun" }, TODAY).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filterTasks(all, { durum: "tamamlanan" }, TODAY).map((t) => t.id)).toEqual(["e"]);
    expect(filterTasks(all, { durum: "acik", dava: "c1" }, TODAY)).toHaveLength(4);
  });

  it("sorts overdue first, then by due date, undated last", () => {
    const undated = task({ id: "u" });
    const later = task({ id: "l", due_date: "2026-12-01" });
    const soon = task({ id: "s", due_date: "2026-10-02" });
    const overdue = task({ id: "o", due_date: "2026-09-01" });
    expect(sortTasks([undated, later, soon, overdue], TODAY).map((t) => t.id)).toEqual(["o", "s", "l", "u"]);
  });
});

describe("document list query", () => {
  const docs: DocumentWithCase[] = [
    { id: "d1", case_id: "c1", case_name: "A", case_number: "1", filename: "Sözleşme.pdf", file_type: "pdf", extracted_text: null, uploaded_at: "2026-01-01" },
    { id: "d2", case_id: "c2", case_name: "B", case_number: "2", filename: "notlar.txt", file_type: "txt", extracted_text: null, uploaded_at: "2026-01-02" },
  ];

  it("filters by type, case and case-insensitive Turkish filename search", () => {
    expect(parseDocumentListQuery(new URLSearchParams("tur=pdf&dava=c1&ara=SÖZ"))).toEqual({ tur: "pdf", dava: "c1", ara: "SÖZ" });
    expect(filterDocuments(docs, { tur: "txt" }).map((d) => d.id)).toEqual(["d2"]);
    expect(filterDocuments(docs, { dava: "c1" }).map((d) => d.id)).toEqual(["d1"]);
    expect(filterDocuments(docs, { ara: "SÖZ" }).map((d) => d.id)).toEqual(["d1"]);
  });
});

describe("calendar, tabs and dates", () => {
  it("accepts only valid YYYY-MM months", () => {
    expect(parseCalendarQuery(new URLSearchParams("ay=2026-10&goster=gorev"))).toEqual({ ay: "2026-10", goster: "gorev" });
    expect(parseCalendarQuery(new URLSearchParams("ay=2026-13&goster=x"))).toEqual({});
  });

  it("builds case detail links and parses tab slugs", () => {
    expect(caseDetailHref("c1")).toBe("/davalar/c1");
    expect(caseDetailHref("c1", "genel")).toBe("/davalar/c1");
    expect(caseDetailHref("c1", "gorevler")).toBe("/davalar/c1?sekme=gorevler");
    expect(parseCaseTab("belgeler")).toBe("belgeler");
    expect(parseCaseTab("yok")).toBe("genel");
    expect(parseCaseTab(null)).toBe("genel");
  });

  it("counts days until a date-only string", () => {
    expect(daysUntil("2026-09-30", TODAY)).toBe(0);
    expect(daysUntil("2026-10-07", TODAY)).toBe(7);
    expect(daysUntil("2026-09-29", TODAY)).toBe(-1);
  });
});
