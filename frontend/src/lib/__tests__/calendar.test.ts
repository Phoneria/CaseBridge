import { describe, expect, it } from "vitest";

import {
  addDays,
  agendaRange,
  describeReminders,
  durationMinutes,
  filterCalendarItems,
  formatDayLong,
  groupByDate,
  isTimed,
  monthRange,
  startOfWeek,
  timedBlock,
  timeLabel,
  toDateKey,
  weekRange,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/types";

function item(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event:e1",
    kind: "event",
    event_type: "meeting",
    title: "Müvekkil toplantısı",
    date: "2026-10-07",
    start: "2026-10-07T14:30:00",
    end: "2026-10-07T16:00:00",
    all_day: false,
    case_id: null,
    case_name: null,
    task_id: null,
    event_id: "e1",
    assignee_id: null,
    assignee_name: null,
    location: null,
    notes: null,
    reminder_days: [1],
    editable: true,
    ...overrides,
  };
}

describe("calendar dates and ranges", () => {
  it("finds the Monday of a week and adds days across months", () => {
    expect(toDateKey(startOfWeek(new Date(2026, 9, 2)))).toBe("2026-09-28"); // Friday -> Monday
    expect(toDateKey(startOfWeek(new Date(2026, 9, 4)))).toBe("2026-09-28"); // Sunday -> Monday
    expect(toDateKey(startOfWeek(new Date(2026, 9, 5)))).toBe("2026-10-05"); // Monday stays
    expect(toDateKey(addDays(new Date(2026, 9, 30), 3))).toBe("2026-11-02");
  });

  it("builds the fetch range of each view", () => {
    expect(monthRange(new Date(2026, 1, 1))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(weekRange(new Date(2026, 9, 5))).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(agendaRange(new Date(2026, 9, 2))).toEqual({ from: "2026-10-02", to: "2026-10-31" });
  });

  it("formats a day in Turkish", () => {
    expect(formatDayLong("2026-10-07")).toBe("7 Ekim 2026 Çarşamba");
  });
});

describe("calendar items", () => {
  it("reads times and durations from naive ISO strings", () => {
    expect(timeLabel("2026-10-07T14:30:00")).toBe("14:30");
    expect(durationMinutes(item())).toBe(90);
    expect(durationMinutes(item({ start: null, end: null, all_day: true }))).toBe(60);
    expect(isTimed(item())).toBe(true);
    expect(isTimed(item({ all_day: true, start: null, end: null }))).toBe(false);
  });

  it("places timed items in the 08:00-20:00 grid at 48px per hour", () => {
    expect(timedBlock(item())).toEqual({ top: 312, height: 72 });
    expect(timedBlock(item({ start: "2026-10-07T07:00:00", end: "2026-10-07T09:00:00" }))).toEqual({ top: 0, height: 48 });
    expect(timedBlock(item({ start: "2026-10-07T21:00:00", end: "2026-10-07T22:00:00" }))).toEqual({ top: 564, height: 12 });
  });

  it("groups items by day keeping their order", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b", date: "2026-10-08" });
    const c = item({ id: "c" });
    expect(groupByDate([a, b, c])).toEqual({ "2026-10-07": [a, c], "2026-10-08": [b] });
  });

  it("filters by type, assignee, case and 'only mine'", () => {
    const hearing = item({ id: "h", kind: "case_hearing", event_type: "hearing", case_id: "c1", assignee_id: "u1" });
    const task = item({ id: "t", kind: "task", event_type: "task", case_id: "c2", assignee_id: "u2" });
    const meeting = item({ id: "m", assignee_id: null });
    const all = [hearing, task, meeting];
    const ids = (list: CalendarEvent[]) => list.map((i) => i.id);

    expect(ids(filterCalendarItems(all, {}, "u1"))).toEqual(["h", "t", "m"]);
    expect(ids(filterCalendarItems(all, { tur: "durusma" }, null))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { tur: "gorev" }, null))).toEqual(["t"]);
    expect(ids(filterCalendarItems(all, { sorumlu: "u2" }, null))).toEqual(["t"]);
    expect(ids(filterCalendarItems(all, { dava: "c1" }, null))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { benim: "1" }, "u1"))).toEqual(["h"]);
    expect(ids(filterCalendarItems(all, { benim: "1" }, null))).toEqual([]);
  });

  it("describes reminder choices in Turkish", () => {
    expect(describeReminders([])).toBe("Hatırlatma yok");
    expect(describeReminders([0, 3, 1])).toBe("3 gün önce, 1 gün önce, Aynı gün");
  });
});
