import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
const getCases = vi.fn();
const getPrecedents = vi.fn();
const listAllTasks = vi.fn();
const getCalendarEvents = vi.fn();
vi.mock("@/lib/api", () => ({
  getCases: (...args: unknown[]) => getCases(...args),
  getPrecedents: (...args: unknown[]) => getPrecedents(...args),
  listAllTasks: (...args: unknown[]) => listAllTasks(...args),
  getCalendarEvents: (...args: unknown[]) => getCalendarEvents(...args),
}));

import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { relevantNotifications } from "@/components/UpcomingNotifications";

beforeEach(() => {
  vi.clearAllMocks();
  getCases.mockResolvedValue([]);
  getPrecedents.mockResolvedValue([]);
  listAllTasks.mockResolvedValue([]);
  getCalendarEvents.mockResolvedValue([]);
});

describe("WorkspaceHeader", () => {
  it("shows the current section, useful shortcuts and signed-in user", async () => {
    render(<WorkspaceHeader user={{
      id: "u1", email: "admin@example.test", full_name: "Ayşe Demir", department: null,
      gender: null, role: "admin", law_firm_id: "f1", is_active: true,
    }} />);

    expect(screen.getByText("CaseBridge / Admin Paneli")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Takvim" })).toHaveAttribute("href", "/takvim");
    expect(screen.getByRole("link", { name: "Görevler" })).toHaveAttribute("href", "/gorevler");
    expect(screen.getByText("Ayşe Demir")).toBeInTheDocument();
    expect(screen.getByText("Yönetici")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Bildirimler" })).toBeInTheDocument());
  });

  it("searches precedents and opens the selected decision", async () => {
    getPrecedents.mockResolvedValue([{ id: "p1", case_name: "Kira tespit kararı", case_number: "2026/1", description: "Kira artışı" }]);
    render(<WorkspaceHeader user={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Genel arama" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Dava, emsal veya görev ara" }), "kira");
    expect(await screen.findByRole("link", { name: /Kira tespit kararı/ })).toHaveAttribute("href", "/emsaller?karar=p1");
    expect(getCases).toHaveBeenCalledWith({ include_archived: true });
  });

  it("shows upcoming work without including old hearings", async () => {
    const day = (offset: number) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    getCalendarEvents.mockResolvedValue([
      { event_type: "hearing", date: day(2), title: "Duruşma", case_id: "c1", case_name: "Kira Davası", task_id: null },
      { event_type: "hearing", date: day(-4), title: "Geçmiş Duruşma", case_id: "c2", case_name: "Eski Dava", task_id: null },
      { event_type: "task", date: day(-1), title: "Dilekçe", case_id: "c1", case_name: "Kira Davası", task_id: "t1" },
    ]);
    render(<WorkspaceHeader user={null} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /2 yaklaşan kayıt/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /2 yaklaşan kayıt/ }));
    expect(screen.getByRole("link", { name: /Dilekçe/ })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
    expect(screen.getByRole("link", { name: /Duruşma/ })).toHaveAttribute("href", "/davalar/c1");
    expect(screen.queryByText("Geçmiş Duruşma")).not.toBeInTheDocument();
  });
});

describe("relevantNotifications", () => {
  it("includes next-seven-day events and overdue tasks, not past hearings", () => {
    const base = { title: "İş", case_id: "c1", case_name: "Dava", task_id: null };
    const events = [
      { ...base, event_type: "hearing" as const, date: "2026-10-11" },
      { ...base, event_type: "hearing" as const, date: "2026-10-12" },
      { ...base, event_type: "hearing" as const, date: "2026-10-03" },
      { ...base, event_type: "task" as const, date: "2026-10-03", task_id: "t1" },
    ];
    expect(relevantNotifications(events, new Date(2026, 9, 4)).map((row) => `${row.event_type}:${row.date}`)).toEqual([
      "task:2026-10-03", "hearing:2026-10-11",
    ]);
  });
});
