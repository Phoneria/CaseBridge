import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

beforeEach(() => {
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
});
