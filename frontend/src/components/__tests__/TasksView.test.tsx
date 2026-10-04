import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const listAllTasks = vi.fn();
const updateTaskStatus = vi.fn();
const createTask = vi.fn();
const getCases = vi.fn();
const listUsers = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllTasks: (...args: unknown[]) => listAllTasks(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
  createTask: (...args: unknown[]) => createTask(...args),
  getCases: (...args: unknown[]) => getCases(...args),
  listUsers: (...args: unknown[]) => listUsers(...args),
}));
import { ApiError } from "@/lib/apiError";

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

const caseOne = { id: "c1", case_number: "2026/1", case_name: "Sözleşmenin Feshi Davası", client_name: "Ayşe Kaya" };
const caseTwo = { id: "c2", case_number: "2026/2", case_name: "Kira Tahliye Davası", client_name: "Mehmet Can" };

beforeEach(() => {
  resetNav();
  setUrl("/gorevler");
  listAllTasks.mockReset();
  updateTaskStatus.mockReset();
  createTask.mockReset();
  getCases.mockReset();
  listUsers.mockReset();
  getCases.mockResolvedValue([caseOne, caseTwo]);
  listUsers.mockResolvedValue([{ id: "u1", full_name: "Av. Ayşe Demir", email: "a@x.dev", role: "lawyer", law_firm_id: "f1", is_active: true }]);
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
    expect(screen.getByText("İlk görevi 'Yeni görev' ile ekleyin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni görev" })).toBeInTheDocument();
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
  describe("Yeni görev", () => {
    async function openForm() {
      await userEvent.click(await screen.findByRole("button", { name: "Yeni görev" }));
      return screen.findByRole("dialog", { name: "Yeni görev" });
    }

    it("shows the button with tasks present and opens the modal, loading cases and users", async () => {
      listAllTasks.mockResolvedValue([pendingTask]);
      render(<TasksView />);

      const dialog = await openForm();

      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(await within(dialog).findByText("Kira Tahliye Davası")).toBeInTheDocument();
      expect(within(dialog).getByRole("option", { name: "Av. Ayşe Demir" })).toBeInTheDocument();
      expect(within(dialog).getByRole("option", { name: "Atanmadı" })).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Başlık")).toHaveFocus();
    });

    it("shows Turkish validation messages and does not call the API", async () => {
      listAllTasks.mockResolvedValue([]);
      render(<TasksView />);
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
      const alert = within(dialog).getByRole("alert");
      expect(alert).toHaveTextContent("Başlık gerekli.");
      expect(alert).toHaveTextContent("Dava seçin.");

      expect(within(dialog).getByLabelText("Başlık")).toHaveAttribute("maxlength", "200");
      expect(createTask).not.toHaveBeenCalled();
    });

    it("rejects a title over 200 characters", async () => {
      listAllTasks.mockResolvedValue([]);
      render(<TasksView />);
      const dialog = await openForm();
      const input = within(dialog).getByLabelText("Başlık") as HTMLInputElement;
      input.removeAttribute("maxlength");
      await userEvent.click(input);
      await userEvent.paste("x".repeat(201));
      await userEvent.click(within(dialog).getByRole("button", { name: /Kira Tahliye/ }));

      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("Başlık en fazla 200 karakter olabilir.");
      expect(createTask).not.toHaveBeenCalled();
    });

    it("creates the task with the full payload, closes the modal and lists the new task", async () => {
      listAllTasks.mockResolvedValue([pendingTask]);
      createTask.mockResolvedValue({
        ...pendingTask,
        id: "t-new1",
        case_id: "c2",
        title: "Yeni dilekçe",
        due_date: "2999-02-03",
        assigned_to: "u1",
        reminder_days: [7, 1],
      });
      render(<TasksView />);
      const dialog = await openForm();

      await userEvent.type(within(dialog).getByLabelText("Başlık"), "  Yeni dilekçe ");
      await userEvent.click(await within(dialog).findByRole("button", { name: /Kira Tahliye/ }));
      await userEvent.type(within(dialog).getByLabelText("Açıklama"), "Detay");
      await userEvent.type(within(dialog).getByLabelText("Son tarih"), "2999-02-03");
      await userEvent.selectOptions(within(dialog).getByLabelText("Atanan kişi"), "u1");
      await userEvent.click(within(dialog).getByLabelText("7 gün önce"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      await waitFor(() =>
        expect(createTask).toHaveBeenCalledWith("c2", {
          title: "Yeni dilekçe",
          description: "Detay",
          due_date: "2999-02-03",
          assigned_to: "u1",
          reminder_days: [7, 1],
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("Yeni dilekçe")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "2026/2 - Kira Tahliye Davası" })).toBeInTheDocument();
    });

    it("omits optional fields and reminder_days when there is no due date, and disables the reminders", async () => {
      listAllTasks.mockResolvedValue([]);
      createTask.mockResolvedValue({ ...pendingTask, id: "t2", title: "Basit", due_date: null });
      render(<TasksView />);
      const dialog = await openForm();

      expect(within(dialog).getByLabelText("1 gün önce")).toBeDisabled();
      await userEvent.type(within(dialog).getByLabelText("Başlık"), "Basit");
      await userEvent.click(await within(dialog).findByRole("button", { name: /Sözleşmenin Feshi/ }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      await waitFor(() => expect(createTask).toHaveBeenCalledWith("c1", { title: "Basit" }));
    });

    it("sends the default reminder [1] once a due date is set", async () => {
      listAllTasks.mockResolvedValue([]);
      createTask.mockResolvedValue({ ...pendingTask, id: "t3" });
      render(<TasksView />);
      const dialog = await openForm();

      await userEvent.type(within(dialog).getByLabelText("Başlık"), "Tarihli");
      await userEvent.click(await within(dialog).findByRole("button", { name: /Sözleşmenin Feshi/ }));
      await userEvent.type(within(dialog).getByLabelText("Son tarih"), "2999-01-01");
      expect(within(dialog).getByLabelText("1 gün önce")).toBeChecked();
      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      await waitFor(() =>
        expect(createTask).toHaveBeenCalledWith("c1", { title: "Tarihli", due_date: "2999-01-01", reminder_days: [1] }),
      );
    });

    it("shows the backend error, keeps the modal open and the list unchanged", async () => {
      listAllTasks.mockResolvedValue([pendingTask]);
      createTask.mockRejectedValue(new ApiError("Kullanıcı bulunamadı", 404));
      render(<TasksView />);
      const dialog = await openForm();
      await userEvent.type(within(dialog).getByLabelText("Başlık"), "Hatalı");
      await userEvent.click(await within(dialog).findByRole("button", { name: /Sözleşmenin Feshi/ }));

      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Görev eklenemedi: Kullanıcı bulunamadı");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByText("Hatalı")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Kaydet" })).toBeEnabled();
    });

    it("shows an error inside the form when cases or users fail to load", async () => {
      listAllTasks.mockResolvedValue([]);
      getCases.mockRejectedValue(new Error("boom"));
      render(<TasksView />);
      const dialog = await openForm();

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Davalar veya kullanıcılar yüklenemedi.");
    });

    it("preselects the case from ?dava=", async () => {
      setUrl("/gorevler?dava=c2");
      listAllTasks.mockResolvedValue([pendingTask]);
      render(<TasksView />);
      const dialog = await openForm();

      expect(await within(dialog).findByText("Kira Tahliye Davası", { selector: "strong" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Kira Tahliye/ })).toHaveAttribute("aria-pressed", "true");
    });

    it("closes with Escape, restores focus to the button, and ignores Escape and close controls while saving", async () => {
      listAllTasks.mockResolvedValue([]);
      let resolve!: (value: unknown) => void;
      createTask.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<TasksView />);
      const button = await screen.findByRole("button", { name: "Yeni görev" });
      button.focus();
      await userEvent.click(button);
      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(button).toHaveFocus();

      await userEvent.click(button);
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Başlık"), "Bekleyen");
      await userEvent.click(await within(dialog).findByRole("button", { name: /Sözleşmenin Feshi/ }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Formu kapat" })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Vazgeç" })).toBeDisabled();
      resolve({ ...pendingTask, id: "t9", title: "Bekleyen" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });
});
