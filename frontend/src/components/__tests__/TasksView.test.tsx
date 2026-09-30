import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const listAllTasks = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllTasks: (...args: unknown[]) => listAllTasks(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

import { TasksView } from "@/components/TasksView";

const pendingTask = {
  id: "t1",
  case_id: "c1",
  case_name: "Sözleşmenin Feshi Davası",
  case_number: "2026/1",
  title: "Bilirkişi raporunu incele",
  description: null,
  due_date: "2026-09-01",
  status: "pending",
  assigned_to: null,
  created_at: "2026-01-01",
  completed_at: null,
};

const overdueTask = { ...pendingTask, id: "t-old", title: "Gecikmiş dilekçe", due_date: "2000-01-01" };
const futureTask = { ...pendingTask, id: "t-new", title: "Uzak görev", due_date: "2999-01-01" };
const doneTask = { ...pendingTask, id: "t-done", title: "Biten görev", status: "completed", due_date: "2000-01-02" };

beforeEach(() => {
  resetNav();
  setUrl("/gorevler");
  listAllTasks.mockReset();
  updateTaskStatus.mockReset();
});

describe("TasksView", () => {
  it("lists tasks across cases with the case name", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);

    render(<TasksView />);

    await waitFor(() => expect(screen.getByText("Bilirkişi raporunu incele")).toBeInTheDocument());
    expect(screen.getByText(/Sözleşmenin Feshi Davası/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no tasks", async () => {
    listAllTasks.mockResolvedValue([]);

    render(<TasksView />);

    await waitFor(() => expect(screen.getByText(/henüz görev yok/i)).toBeInTheDocument());
  });

  it("marks a task completed when its checkbox is toggled", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);
    updateTaskStatus.mockResolvedValue({ ...pendingTask, status: "completed", completed_at: "2026-01-05" });

    render(<TasksView />);
    await waitFor(() => expect(screen.getByText("Bilirkişi raporunu incele")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith("c1", "t1", "completed"));
  });

  it("filters by ?vade=gecikmis and lists overdue first by default", async () => {
    listAllTasks.mockResolvedValue([futureTask, overdueTask, doneTask]);

    const { unmount } = render(<TasksView />);
    await screen.findByText("Gecikmiş dilekçe");
    const titles = screen.getAllByTestId("task-title").map((el) => el.textContent);
    expect(titles[0]).toBe("Gecikmiş dilekçe");
    unmount();

    setUrl("/gorevler?vade=gecikmis");
    render(<TasksView />);
    await screen.findByText("Gecikmiş dilekçe");
    expect(screen.queryByText("Uzak görev")).not.toBeInTheDocument();
    expect(screen.queryByText("Biten görev")).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Aktif filtreler" })).getByText("Gecikmiş")).toBeInTheDocument();
  });

  it("filters by ?durum=tamamlanan", async () => {
    setUrl("/gorevler?durum=tamamlanan");
    listAllTasks.mockResolvedValue([futureTask, doneTask]);
    render(<TasksView />);
    await screen.findByText("Biten görev");
    expect(screen.queryByText("Uzak görev")).not.toBeInTheDocument();
  });

  it("turns the summary cards into toggling filter links", async () => {
    listAllTasks.mockResolvedValue([overdueTask]);
    const { unmount } = render(<TasksView />);
    expect(await screen.findByRole("link", { name: /Gecikmiş\s*1/ })).toHaveAttribute("href", "/gorevler?vade=gecikmis");
    unmount();

    setUrl("/gorevler?vade=gecikmis");
    render(<TasksView />);
    expect(await screen.findByRole("link", { name: /Gecikmiş\s*1/ })).toHaveAttribute("href", "/gorevler");
  });

  it("links the title to the preview and the case name to the case filter", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);
    render(<TasksView />);
    await screen.findByText("Bilirkişi raporunu incele");

    expect(screen.getByRole("link", { name: "Bilirkişi raporunu incele" })).toHaveAttribute("href", "/gorevler?onizle=c1&odak=gorev%3At1");
    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/gorevler?dava=c1");
  });

  it("does not navigate when the checkbox is toggled", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);
    updateTaskStatus.mockResolvedValue({ ...pendingTask, status: "completed" });
    render(<TasksView />);
    await userEvent.click(await screen.findByRole("checkbox"));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("shows the filtered empty state", async () => {
    setUrl("/gorevler?vade=gecikmis");
    listAllTasks.mockResolvedValue([futureTask]);
    render(<TasksView />);
    expect(await screen.findByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
  });

  it("keeps each card's number equal to the rows its link opens (dava scoped)", async () => {
    const otherCase = { ...pendingTask, id: "x1", case_id: "c2", title: "Başka dava görevi 1" };
    const otherCase2 = { ...pendingTask, id: "x2", case_id: "c2", title: "Başka dava görevi 2", due_date: "2999-01-01" };
    const mine = { ...pendingTask, id: "m1", title: "Benim görevim", due_date: "2999-01-01" };
    listAllTasks.mockResolvedValue([mine, otherCase, otherCase2]);

    for (const [query, label] of [
      ["dava=c1", "Açık görev"],
      ["dava=c1&durum=tamamlanan", "Gecikmiş"],
    ]) {
      setUrl(`/gorevler?${query}`);
      const first = render(<TasksView />);
      const card = await screen.findByRole("link", { name: new RegExp(`^${label}`) });
      const shown = Number(card.querySelector("p:last-child")?.textContent);
      const href = card.getAttribute("href")!;
      first.unmount();

      setUrl(href);
      render(<TasksView />);
      await screen.findByRole("link", { name: new RegExp(`^${label}`) });
      expect(screen.queryAllByTestId("task-title")).toHaveLength(shown);
      cleanup();
    }
  });
});
