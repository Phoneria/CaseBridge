import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCalendarEvents = vi.fn();

vi.mock("@/lib/api", () => ({
  getCalendarEvents: (...args: unknown[]) => getCalendarEvents(...args),
}));

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { CalendarView } from "@/components/CalendarView";

const hearingEvent = {
  event_type: "hearing",
  date: "2026-10-05",
  title: "Duruşma - Sözleşmenin Feshi Davası",
  case_id: "c1",
  case_name: "Sözleşmenin Feshi Davası",
  task_id: null,
};

const taskEvent = {
  event_type: "task",
  date: "2026-09-20",
  title: "Dilekçe hazırla",
  case_id: "c2",
  case_name: "Boşanma Davası",
  task_id: "t9",
};

beforeEach(() => {
  resetNav();
  setUrl("/takvim");
  getCalendarEvents.mockReset();
});

describe("CalendarView", () => {
  it("renders events in a navigable monthly calendar", async () => {
    getCalendarEvents.mockResolvedValue([taskEvent, hearingEvent]);

    render(<CalendarView />);

    await waitFor(() => expect(screen.getByText(/Dilekçe hazırla/)).toBeInTheDocument());
    expect(screen.getByText("Pzt")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));
    expect(screen.getByText(/Duruşma - Sözleşmenin Feshi Davası/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no events", async () => {
    getCalendarEvents.mockResolvedValue([]);

    render(<CalendarView />);

    await waitFor(() => expect(screen.getByText(/henüz.*tarih yok|takvimde.*yok/i)).toBeInTheDocument());
  });

  it("opens the month given in ?ay= and links events to the preview", async () => {
    setUrl("/takvim?ay=2026-10");
    getCalendarEvents.mockResolvedValue([hearingEvent, { ...taskEvent, date: "2026-10-06" }]);
    render(<CalendarView />);

    expect(await screen.findByText("Ekim 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Duruşma - Sözleşmenin Feshi Davası/ })).toHaveAttribute("href", "/takvim?ay=2026-10&onizle=c1");
    expect(screen.getByRole("link", { name: /Dilekçe hazırla/ })).toHaveAttribute("href", "/takvim?ay=2026-10&onizle=c2&odak=gorev%3At9");
  });

  it("writes month changes to the URL", async () => {
    setUrl("/takvim?ay=2026-10");
    getCalendarEvents.mockResolvedValue([]);
    render(<CalendarView />);
    await userEvent.click(await screen.findByRole("button", { name: "Sonraki ay" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-11", { scroll: false });
  });

  it("collapses busy days behind a '+n daha' popover", async () => {
    setUrl("/takvim?ay=2026-10");
    const busy = [1, 2, 3, 4, 5].map((n) => ({ ...taskEvent, date: "2026-10-15", title: `Görev ${n}`, task_id: `t${n}` }));
    getCalendarEvents.mockResolvedValue(busy);
    render(<CalendarView />);

    await screen.findByText("Görev 1");
    expect(screen.queryByText("Görev 4")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+2 daha" }));

    const popover = screen.getByRole("dialog", { name: "15 Ekim olayları" });
    expect(within(popover).getAllByRole("link")).toHaveLength(5);
  });

  it("filters by event type from ?goster=", async () => {
    setUrl("/takvim?ay=2026-10&goster=durusma");
    getCalendarEvents.mockResolvedValue([hearingEvent, { ...taskEvent, date: "2026-10-06" }]);
    render(<CalendarView />);

    await screen.findByText(/Duruşma - Sözleşmenin Feshi Davası/);
    expect(screen.queryByText("Dilekçe hazırla")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duruşma/, pressed: true })).toBeInTheDocument();
  });
});
