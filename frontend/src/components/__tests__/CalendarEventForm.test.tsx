import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();

vi.mock("@/lib/api", () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
}));

import { CalendarEventForm, eventFormInitialFromItem } from "@/components/calendar/CalendarEventForm";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";
import { ApiError } from "@/lib/apiError";
import type { AppUser, CalendarEvent, Case } from "@/types";

const cases = [
  { id: "c1", case_name: "Ticari Kira Uyarlama Davası", case_number: "2026/14", client_name: "Deniz Arslan" },
] as Case[];
const users = [{ id: "u1", full_name: "Avukat A" }] as AppUser[];

beforeEach(() => {
  createCalendarEvent.mockReset();
  updateCalendarEvent.mockReset();
});

describe("ReminderPicker", () => {
  it("toggles offsets largest first and clears with 'Hatırlatma yok'", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ReminderPicker value={[1]} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("3 gün önce"));
    expect(onChange).toHaveBeenLastCalledWith([3, 1]);
    await userEvent.click(screen.getByLabelText("1 gün önce"));
    expect(onChange).toHaveBeenLastCalledWith([]);

    rerender(<ReminderPicker value={[]} onChange={onChange} />);
    expect(screen.getByLabelText("Hatırlatma yok")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Aynı gün"));
    expect(onChange).toHaveBeenLastCalledWith([0]);
  });
});

describe("CalendarEventForm", () => {
  it("validates required fields before sending", async () => {
    render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText("Süre (dakika)"));
    await userEvent.type(screen.getByLabelText("Süre (dakika)"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Başlık zorunludur.");
    expect(alert).toHaveTextContent("Süre 5 ile 1440 dakika arasında olmalıdır.");
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("creates an event with case, assignee and type-based reminder defaults", async () => {
    const record = { id: "e1" };
    createCalendarEvent.mockResolvedValue(record);
    const onSaved = vi.fn();
    render(
      <CalendarEventForm initial={{ date: "2026-10-07", time: "14:00" }} cases={cases} users={users} onClose={vi.fn()} onSaved={onSaved} />,
    );

    expect(screen.getByRole("heading", { name: "Yeni etkinlik" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Başlık"), "  Kira duruşması ");
    await userEvent.selectOptions(screen.getByLabelText("Tür"), "Duruşma");
    expect(screen.getByLabelText("3 gün önce")).toBeChecked(); // hearing default [3, 1]
    await userEvent.clear(screen.getByLabelText("Süre (dakika)"));
    await userEvent.type(screen.getByLabelText("Süre (dakika)"), "90");
    await userEvent.click(within(screen.getByRole("list", { name: "Davalar" })).getByRole("button", { name: /Ticari Kira/ }));
    await userEvent.selectOptions(screen.getByLabelText("Sorumlu"), "Avukat A");
    await userEvent.type(screen.getByLabelText("Konum"), "İstanbul Adliyesi");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(record));
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Kira duruşması",
      event_type: "hearing",
      starts_at: "2026-10-07T14:00:00",
      all_day: false,
      duration_minutes: 90,
      location: "İstanbul Adliyesi",
      notes: null,
      case_id: "c1",
      assignee_id: "u1",
      reminder_days: [3, 1],
    });
  });

  it("sends all-day events at midnight without a reminder when 'Hatırlatma yok' is chosen", async () => {
    createCalendarEvent.mockResolvedValue({ id: "e2" });
    render(<CalendarEventForm initial={{ date: "2026-10-08" }} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Başlık"), "Bayram");
    await userEvent.click(screen.getByLabelText("Tüm gün"));
    expect(screen.getByLabelText("Saat")).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Hatırlatma yok"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalled());
    expect(createCalendarEvent.mock.calls[0][0]).toMatchObject({ starts_at: "2026-10-08T00:00:00", all_day: true, reminder_days: [] });
  });

  it("edits an existing event and shows API errors", async () => {
    updateCalendarEvent.mockRejectedValue(new ApiError("Dava bulunamadı", 404));
    const item: CalendarEvent = {
      id: "event:e1", kind: "event", event_type: "client_meeting", title: "Müvekkil görüşmesi", date: "2026-10-07",
      start: "2026-10-07T10:30:00", end: "2026-10-07T11:15:00", all_day: false, case_id: null, case_name: null,
      task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: "Not",
      reminder_days: [7], editable: true,
    };
    render(<CalendarEventForm initial={eventFormInitialFromItem(item)} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Etkinliği düzenle" })).toBeInTheDocument();
    expect(screen.getByLabelText("Saat")).toHaveValue("10:30");
    expect(screen.getByLabelText("Süre (dakika)")).toHaveValue(45);
    expect(screen.getByLabelText("7 gün önce")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Etkinlik kaydedilemedi: Dava bulunamadı"));
    expect(updateCalendarEvent).toHaveBeenCalledWith("e1", expect.objectContaining({ event_type: "client_meeting", reminder_days: [7] }));
  });

  it("closes with Vazgeç and Escape", async () => {
    const onClose = vi.fn();
    render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={onClose} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("focuses the title on open and restores focus on unmount", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Başlık")).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("ignores Escape and disables Vazgeç while saving", async () => {
    createCalendarEvent.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<CalendarEventForm initial={{ date: "2026-10-07" }} cases={cases} users={users} onClose={onClose} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Başlık"), "Toplantı");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
