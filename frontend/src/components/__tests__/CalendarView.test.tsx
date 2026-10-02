import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCalendarEvents = vi.fn();
const getMe = vi.fn();
const listUsers = vi.fn();
const getCases = vi.fn();
const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const deleteCalendarEvent = vi.fn();
const updateTaskReminders = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getCalendarEvents: (...args: unknown[]) => getCalendarEvents(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listUsers: (...args: unknown[]) => listUsers(...args),
  getCases: (...args: unknown[]) => getCases(...args),
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  updateTaskReminders: (...args: unknown[]) => updateTaskReminders(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { CalendarView } from "@/components/CalendarView";
import type { CalendarEvent } from "@/types";

function item(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
    start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: null, case_name: null,
    task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: null,
    reminder_days: [1], editable: true, ...overrides,
  };
}

const hearing = item({
  id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Sözleşmenin Feshi Davası",
  date: "2026-10-05", start: null, end: null, all_day: true, case_id: "c1", case_name: "Sözleşmenin Feshi Davası",
  event_id: null, assignee_id: "u2", assignee_name: "Avukat B", reminder_days: [3, 1], editable: false,
});
const task = item({
  id: "task:t9", kind: "task", event_type: "task", title: "Dilekçe hazırla", date: "2026-09-20", start: null, end: null,
  all_day: true, case_id: "c2", case_name: "Boşanma Davası", task_id: "t9", event_id: null, editable: false,
});
const meeting = item({});

/** Answers getCalendarEvents with the items inside the requested range. */
function serve(items: CalendarEvent[]) {
  getCalendarEvents.mockImplementation(async (range: { from: string; to: string }) =>
    items.filter((i) => i.date >= range.from && i.date <= range.to),
  );
}

beforeEach(() => {
  resetNav();
  setUrl("/takvim");
  [getCalendarEvents, getMe, listUsers, getCases, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
    updateTaskReminders, updateTaskStatus].forEach((fn) => fn.mockReset());
  getMe.mockResolvedValue({ id: "u1", full_name: "Avukat A" });
  listUsers.mockResolvedValue([{ id: "u1", full_name: "Avukat A" }, { id: "u2", full_name: "Avukat B" }]);
  getCases.mockResolvedValue([{ id: "c1", case_name: "Sözleşmenin Feshi Davası", case_number: "2026/1", client_name: "X" }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView", () => {
  it("loads the visible month and navigates between months", async () => {
    setUrl("/takvim?ay=2026-09");
    serve([task, hearing]);
    render(<CalendarView />);

    expect(await screen.findByText("Dilekçe hazırla")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-30" });

    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));
    expect(await screen.findByText("Duruşma - Sözleşmenin Feshi Davası")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-01", to: "2026-10-31" });
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-10", { scroll: false });
  });

  it("shows an empty state when there are no events", async () => {
    serve([]);
    render(<CalendarView />);
    await waitFor(() => expect(screen.getByText(/takvimde.*yok/i)).toBeInTheDocument());
  });

  it("shows an error when the calendar cannot be loaded", async () => {
    getCalendarEvents.mockRejectedValue(new Error("x"));
    render(<CalendarView />);
    expect(await screen.findByText("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });

  it("keeps legacy ?goster= links working as a type filter", async () => {
    setUrl("/takvim?ay=2026-10&goster=durusma");
    serve([hearing, meeting]);
    render(<CalendarView />);

    await screen.findByText("Duruşma - Sözleşmenin Feshi Davası");
    expect(screen.queryByText("Müvekkil toplantısı")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tür")).toHaveValue("durusma");
  });

  it("filters to my items and writes the filter to the URL", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([hearing, meeting]);
    render(<CalendarView />);
    await screen.findByText("Müvekkil toplantısı");
    await waitFor(() => expect(getMe).toHaveBeenCalled());

    await userEvent.click(screen.getByLabelText("Yalnızca benimkiler"));

    expect(screen.queryByText("Duruşma - Sözleşmenin Feshi Davası")).not.toBeInTheDocument();
    expect(screen.getByText("Müvekkil toplantısı")).toBeInTheDocument();
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-10&benim=1", { scroll: false });
  });

  it("switches to the week view, loads that week and navigates by week", async () => {
    setUrl("/takvim?hafta=2026-10-07");
    serve([meeting]);
    render(<CalendarView />);
    await screen.findByText("Takvim");

    await userEvent.click(screen.getByRole("button", { name: "Hafta" }));

    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?hafta=2026-10-07&gorunum=hafta", { scroll: false });
    expect(await screen.findByText("5 – 11 Ekim 2026")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-05", to: "2026-10-11" });
    expect(within(screen.getByTestId("day-2026-10-07")).getByRole("button", { name: /Müvekkil toplantısı/ })).toHaveStyle({ top: "312px" });

    await userEvent.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("lists the next 30 days in the agenda view", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0));
    setUrl("/takvim?gorunum=ajanda");
    serve([hearing, meeting]);
    render(<CalendarView />);

    expect(await screen.findByRole("list", { name: "Ajanda" })).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenCalledWith({ from: "2026-10-02", to: "2026-10-31" });
    expect(screen.getByText("5 Ekim Pazartesi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bugün" })).not.toBeInTheDocument();
  });

  it("opens the detail drawer, edits the event and reloads after saving", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([meeting]);
    updateCalendarEvent.mockResolvedValue({ id: "e1" });
    render(<CalendarView />);

    await userEvent.click(await screen.findByRole("button", { name: /Müvekkil toplantısı/ }));
    expect(screen.getByRole("dialog", { name: "Müvekkil toplantısı" })).toHaveTextContent("14:30 – 16:00");

    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(screen.queryByRole("dialog", { name: "Müvekkil toplantısı" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Başlık")).toHaveValue("Müvekkil toplantısı");
    const calls = getCalendarEvents.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledWith("e1", expect.objectContaining({ starts_at: "2026-10-07T14:30:00" })));
    await waitFor(() => expect(getCalendarEvents.mock.calls.length).toBe(calls + 1));
    expect(screen.queryByRole("heading", { name: "Etkinliği düzenle" })).not.toBeInTheDocument();
  });

  it("opens the add form on the clicked day", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([]);
    render(<CalendarView />);

    await userEvent.click(await screen.findByRole("button", { name: "12 Ekim için etkinlik ekle" }));

    expect(screen.getByRole("heading", { name: "Yeni etkinlik" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tarih")).toHaveValue("2026-10-12");
    expect(screen.getByLabelText("Saat")).toHaveValue("09:00");
  });

  it("closes only the drawer on Escape and never stacks it with the edit form", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([meeting]);
    render(<CalendarView />);

    await userEvent.click(await screen.findByRole("button", { name: /Müvekkil toplantısı/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Müvekkil toplantısı/ }));
    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores a stale response when the range changes quickly", async () => {
    setUrl("/takvim?ay=2026-09");
    getCalendarEvents.mockResolvedValueOnce([]);
    render(<CalendarView />);
    await screen.findByText("Takvim");

    let resolveSlow: (items: CalendarEvent[]) => void = () => undefined;
    getCalendarEvents.mockImplementationOnce(() => new Promise<CalendarEvent[]>((resolve) => { resolveSlow = resolve; }));
    getCalendarEvents.mockResolvedValueOnce([item({ id: "event:e2", event_id: "e2", title: "Kasım toplantısı", date: "2026-11-03", start: "2026-11-03T10:00:00", end: "2026-11-03T11:00:00" })]);
    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" })); // Ekim: slow
    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" })); // Kasım: fast
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Kasım toplantısı")).toBeInTheDocument();

    resolveSlow([hearing]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Duruşma - Sözleşmenin Feshi Davası")).not.toBeInTheDocument();
    expect(screen.getByText("Kasım toplantısı")).toBeInTheDocument();
  });

  it("shows a loading state instead of the previous range while the next one loads", async () => {
    setUrl("/takvim?ay=2026-09");
    getCalendarEvents.mockResolvedValueOnce([task]);
    render(<CalendarView />);
    await screen.findByText("Dilekçe hazırla");

    let resolveNext: (items: CalendarEvent[]) => void = () => undefined;
    getCalendarEvents.mockImplementationOnce(() => new Promise<CalendarEvent[]>((resolve) => { resolveNext = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));

    expect(screen.queryByText("Dilekçe hazırla")).not.toBeInTheDocument();
    expect(screen.queryByText(/takvimde.*yok/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    resolveNext([meeting]);
    expect(await screen.findByText("Müvekkil toplantısı")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the toolbar mounted and usable while a range request is pending", async () => {
    setUrl("/takvim?ay=2026-09");
    getCalendarEvents.mockResolvedValueOnce([task]);
    render(<CalendarView />);
    await screen.findByText("Dilekçe hazırla");

    getCalendarEvents.mockImplementationOnce(() => new Promise<CalendarEvent[]>(() => undefined));
    const next = screen.getByRole("button", { name: "Sonraki ay" });
    await userEvent.click(next);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sonraki ay" })).toBe(next);
    expect(next).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Ekim 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hafta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tür")).toBeInTheDocument();
  });

  it("does not show the previous range's items under an error", async () => {
    setUrl("/takvim?ay=2026-09");
    getCalendarEvents.mockResolvedValueOnce([task]).mockRejectedValueOnce(new Error("x"));
    render(<CalendarView />);
    await screen.findByText("Dilekçe hazırla");
    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));
    expect(await screen.findByText("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
    expect(screen.queryByText("Dilekçe hazırla")).not.toBeInTheDocument();
  });

  it("follows external URL changes while mounted", async () => {
    setUrl("/takvim?ay=2026-09");
    serve([task, meeting]);
    const { rerender } = render(<CalendarView />);
    await screen.findByText("Dilekçe hazırla");

    setUrl("/takvim?ay=2026-11&gorunum=hafta&hafta=2026-10-07");
    rerender(<CalendarView />);

    expect(await screen.findByText("5 – 11 Ekim 2026")).toBeInTheDocument();
    expect(getCalendarEvents).toHaveBeenLastCalledWith({ from: "2026-10-05", to: "2026-10-11" });
    expect(screen.getByRole("button", { name: "Hafta" })).toHaveAttribute("aria-pressed", "true");

    setUrl("/takvim");
    rerender(<CalendarView />);
    expect(await screen.findByRole("button", { name: "Ay" })).toHaveAttribute("aria-pressed", "true");
  });

  it("merges two URL updates made in the same tick", async () => {
    setUrl("/takvim?ay=2026-10");
    serve([]);
    render(<CalendarView />);
    await screen.findByText("Takvim");
    await waitFor(() => expect(getMe).toHaveBeenCalled());

    await act(async () => {
      screen.getByRole("button", { name: "Hafta" }).click();
      screen.getByLabelText("Yalnızca benimkiler").click();
    });

    expect(nav.replace).toHaveBeenLastCalledWith(expect.stringContaining("benim=1"), { scroll: false });
    expect(nav.replace).toHaveBeenLastCalledWith(expect.stringContaining("gorunum=hafta"), { scroll: false });
  });
});
