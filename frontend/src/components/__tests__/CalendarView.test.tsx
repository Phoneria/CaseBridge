import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCalendarEvents = vi.fn();

vi.mock("@/lib/api", () => ({
  getCalendarEvents: (...args: unknown[]) => getCalendarEvents(...args),
}));

import { CalendarView } from "@/components/CalendarView";

const hearingEvent = {
  event_type: "hearing",
  date: "2026-10-05",
  title: "Duruşma - Sözleşmenin Feshi Davası",
  case_id: "c1",
  case_name: "Sözleşmenin Feshi Davası",
};

const taskEvent = {
  event_type: "task",
  date: "2026-09-20",
  title: "Dilekçe hazırla",
  case_id: "c2",
  case_name: "Boşanma Davası",
};

beforeEach(() => {
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
});
