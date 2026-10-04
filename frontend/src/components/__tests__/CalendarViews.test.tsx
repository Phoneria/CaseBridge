import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CalendarAgendaView } from "@/components/calendar/CalendarAgendaView";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import type { AppUser, CalendarEvent, Case } from "@/types";

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
    location: "Büro",
    notes: null,
    reminder_days: [1],
    editable: true,
    ...overrides,
  };
}

const task = item({
  id: "task:t1",
  kind: "task",
  event_type: "task",
  title: "Dilekçe hazırla",
  start: null,
  end: null,
  all_day: true,
  case_id: "c1",
  case_name: "Kira Davası",
  task_id: "t1",
  event_id: null,
  location: null,
});

describe("CalendarMonthView", () => {
  it("opens an item and creates on an empty day", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(
      <CalendarMonthView month={new Date(2026, 9, 1)} items={[item()]} todayKey="2026-10-02" onSelect={onSelect} onCreate={onCreate} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Müvekkil toplantısı/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "event:e1" }));

    await userEvent.click(screen.getByRole("button", { name: "12 Ekim için etkinlik ekle" }));
    expect(onCreate).toHaveBeenCalledWith("2026-10-12");
  });

  it("collapses busy days behind a '+n daha' popover", async () => {
    const busy = [1, 2, 3, 4, 5].map((n) => item({ id: `task:t${n}`, title: `Görev ${n}`, date: "2026-10-15", start: null, end: null, all_day: true }));
    render(<CalendarMonthView month={new Date(2026, 9, 1)} items={busy} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByText("Görev 4")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+2 daha" }));
    const popover = screen.getByRole("dialog", { name: "15 Ekim olayları" });
    expect(within(popover).getAllByRole("button", { name: /Görev/ })).toHaveLength(5);
  });
});

describe("CalendarMonthView popover", () => {
  const busy = [1, 2, 3, 4, 5].map((n) => item({ id: `task:t${n}`, title: `Görev ${n}`, date: "2026-10-15", start: null, end: null, all_day: true }));
  const renderBusy = () =>
    render(<CalendarMonthView month={new Date(2026, 9, 1)} items={busy} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={vi.fn()} />);

  it("moves focus into the popover and closes on Escape, restoring focus to the trigger", async () => {
    renderBusy();
    const trigger = screen.getByRole("button", { name: "+2 daha" });
    await userEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: "15 Ekim olayları" });
    expect(popover).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2 daha" })).toHaveFocus();
  });

  it("right-aligns the popover in the last columns", async () => {
    // 15 Ekim 2026 is a Thursday (left-anchored); 17 Ekim is Saturday.
    const sat = [1, 2, 3, 4].map((n) => item({ id: `task:s${n}`, title: `Cmt ${n}`, date: "2026-10-17", start: null, end: null, all_day: true }));
    render(<CalendarMonthView month={new Date(2026, 9, 1)} items={sat} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "+1 daha" }));
    expect(screen.getByRole("dialog")).toHaveClass("right-1");
  });
});

describe("CalendarWeekView", () => {
  it("puts untimed items in the all-day row and timed items in the hour grid", () => {
    render(
      <CalendarWeekView
        weekStart={new Date(2026, 9, 5)}
        items={[item(), { ...task, date: "2026-10-07" }]}
        todayKey="2026-10-02"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(within(screen.getByTestId("allday-2026-10-07")).getByRole("button", { name: /Dilekçe hazırla/ })).toBeInTheDocument();
    const timed = within(screen.getByTestId("day-2026-10-07")).getByRole("button", { name: /Müvekkil toplantısı/ });
    expect(timed).toHaveStyle({ top: "312px", height: "72px" });
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
  });

  it("creates an event at the clicked hour", async () => {
    const onCreate = vi.fn();
    render(<CalendarWeekView weekStart={new Date(2026, 9, 5)} items={[]} todayKey="2026-10-02" onSelect={vi.fn()} onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("button", { name: "Çar 7 Ekim 14:00 için etkinlik ekle" }));

    expect(onCreate).toHaveBeenCalledWith("2026-10-07", "14:00");
  });
});

describe("CalendarAgendaView", () => {
  it("lists the next 30 days by day and highlights today and this week", () => {
    const items = [
      item({ id: "a", title: "Bugünkü toplantı", date: "2026-10-02", start: "2026-10-02T10:00:00", end: "2026-10-02T11:00:00" }),
      item({ id: "b", title: "Hafta sonu işi", date: "2026-10-04", start: null, end: null, all_day: true }),
      item({ id: "c", title: "Gelecek hafta", date: "2026-10-07" }),
      item({ id: "d", title: "Çok ileride", date: "2026-11-05" }),
    ];
    render(<CalendarAgendaView today={new Date(2026, 9, 2)} items={items} onSelect={vi.fn()} />);

    const days = within(screen.getByRole("list", { name: "Ajanda" })).getAllByRole("heading", { level: 3 });
    expect(days.map((h) => h.textContent)).toEqual(["2 Ekim Cuma", "4 Ekim Pazar", "7 Ekim Çarşamba"]);
    expect(screen.getByText("Bugün")).toBeInTheDocument();
    expect(screen.getAllByText("Bu hafta")).toHaveLength(1);
    expect(screen.queryByText("Çok ileride")).not.toBeInTheDocument();
  });

  it("shows an empty message", () => {
    render(<CalendarAgendaView today={new Date(2026, 9, 2)} items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("Önümüzdeki 30 günde kayıt yok.")).toBeInTheDocument();
  });
});

describe("CalendarFilters", () => {
  const users = [{ id: "u1", full_name: "Avukat A" }] as AppUser[];
  const cases = [{ id: "c1", case_name: "Kira Davası" }] as Case[];

  it("reports filter changes as URL updates", async () => {
    const onChange = vi.fn();
    render(<CalendarFilters query={{}} users={users} cases={cases} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Tür"), "Müvekkil görüşmesi");
    await userEvent.selectOptions(screen.getByLabelText("Sorumlu"), "Avukat A");
    await userEvent.selectOptions(screen.getByLabelText("Dava"), "Kira Davası");
    await userEvent.click(screen.getByLabelText("Yalnızca benimkiler"));

    expect(onChange.mock.calls).toEqual([
      [{ tur: "muvekkil", goster: null }],
      [{ sorumlu: "u1" }],
      [{ dava: "c1" }],
      [{ benim: "1" }],
    ]);
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).not.toBeInTheDocument();
  });

  it("clears every filter", async () => {
    const onChange = vi.fn();
    render(<CalendarFilters query={{ tur: "gorev", benim: "1" }} users={users} cases={cases} onChange={onChange} />);

    expect(screen.getByLabelText("Tür")).toHaveValue("gorev");
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));

    expect(onChange).toHaveBeenCalledWith({ tur: null, goster: null, sorumlu: null, dava: null, benim: null });
  });
});
