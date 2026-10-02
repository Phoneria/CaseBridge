import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const updateTaskReminders = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  updateTaskReminders: (...args: unknown[]) => updateTaskReminders(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import type { CalendarEvent } from "@/types";

const event: CalendarEvent = {
  id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
  start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: "c1",
  case_name: "Ticari Kira Uyarlama Davası", task_id: null, event_id: "e1", assignee_id: "u1",
  assignee_name: "Avukat A", location: "Büro", notes: "Belgeleri getir", reminder_days: [3, 1], editable: true,
};
const task: CalendarEvent = {
  ...event, id: "task:t1", kind: "task", event_type: "task", title: "Dilekçe hazırla", start: null, end: null,
  all_day: true, task_id: "t1", event_id: null, location: null, notes: null, reminder_days: [1], editable: false,
};
const hearing: CalendarEvent = {
  ...event, id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Ticari Kira Uyarlama Davası",
  start: null, end: null, all_day: true, event_id: null, notes: null, reminder_days: [3, 1], editable: false,
};

function renderDrawer(item: CalendarEvent) {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onChanged: vi.fn() };
  render(<CalendarEventDrawer item={item} {...handlers} />);
  return handlers;
}

beforeEach(() => {
  [deleteCalendarEvent, updateCalendarEvent, updateTaskReminders, updateTaskStatus].forEach((fn) => fn.mockReset());
});

describe("CalendarEventDrawer", () => {
  it("shows the event details", () => {
    renderDrawer(event);
    const dialog = screen.getByRole("dialog", { name: "Müvekkil toplantısı" });
    expect(dialog).toHaveTextContent("Toplantı");
    expect(dialog).toHaveTextContent("7 Ekim 2026 Çarşamba");
    expect(dialog).toHaveTextContent("14:30 – 16:00");
    expect(dialog).toHaveTextContent("Avukat A");
    expect(dialog).toHaveTextContent("Büro");
    expect(dialog).toHaveTextContent("Belgeleri getir");
    expect(dialog).toHaveTextContent("3 gün önce, 1 gün önce");
    expect(screen.getByRole("link", { name: "Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/davalar/c1");
  });

  it("edits, changes reminders and deletes an event after inline confirmation", async () => {
    updateCalendarEvent.mockResolvedValue({});
    deleteCalendarEvent.mockResolvedValue(undefined);
    const handlers = renderDrawer(event);

    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(event);

    await userEvent.click(screen.getByRole("button", { name: "Hatırlatmayı değiştir" }));
    await userEvent.click(screen.getByLabelText("7 gün önce"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledWith("e1", { reminder_days: [7, 3, 1] }));
    expect(handlers.onChanged).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(screen.getByText("Bu etkinlik silinsin mi?")).toBeInTheDocument();
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    await waitFor(() => expect(deleteCalendarEvent).toHaveBeenCalledWith("e1"));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("completes a task, changes its reminders and links to the case tasks", async () => {
    updateTaskReminders.mockResolvedValue({});
    updateTaskStatus.mockResolvedValue({});
    const handlers = renderDrawer(task);

    expect(screen.getByRole("dialog")).toHaveTextContent("Tüm gün");
    expect(screen.getByRole("link", { name: "Göreve git" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
    expect(screen.queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hatırlatmayı değiştir" }));
    await userEvent.click(screen.getByLabelText("Hatırlatma yok"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateTaskReminders).toHaveBeenCalledWith("t1", []));

    await userEvent.click(screen.getByRole("button", { name: "Tamamlandı" }));
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith("c1", "t1", "completed"));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("shows case hearings read-only with a link to the case", () => {
    renderDrawer(hearing);
    expect(screen.getByRole("link", { name: "Davayı aç" })).toHaveAttribute("href", "/davalar/c1");
    expect(screen.getByText(/varsayılan hatırlatma: 3 gün ve 1 gün önce/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hatırlatmayı değiştir" })).not.toBeInTheDocument();
  });

  it("shows an error when an action fails and closes on Escape", async () => {
    deleteCalendarEvent.mockRejectedValue(new Error("x"));
    const handlers = renderDrawer(event);
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Etkinlik silinemedi.");

    await userEvent.keyboard("{Escape}");
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("ignores Escape and disables actions while busy", async () => {
    deleteCalendarEvent.mockReturnValue(new Promise(() => {}));
    const handlers = renderDrawer(event);
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    await waitFor(() => expect(deleteCalendarEvent).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Düzenle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hatırlatmayı değiştir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("moves focus to 'Evet, sil' and restores focus on unmount", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<CalendarEventDrawer item={event} onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(screen.getByRole("button", { name: "Evet, sil" })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
