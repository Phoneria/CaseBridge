import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);

const getCase = vi.fn();
const listCaseTasks = vi.fn();
const listDocuments = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
}));

import { CaseQuickView, pickWithFocus } from "@/components/CaseQuickView";
import { ApiError } from "@/lib/apiError";
import { nav, resetNav, setUrl } from "@/test/navigation";

const detail = {
  id: "c1",
  case_number: "2026/14",
  case_name: "Ticari Kira Uyarlama Davası",
  client_name: "Deniz Arslan",
  opposing_party: null,
  court: null,
  case_type: "kira",
  status: "durusma_bekleyen",
  next_hearing_date: null,
  timeline: [
    { id: "e1", event_date: "2026-01-10", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-10" },
    { id: "e2", event_date: "2026-03-01", title: "Bilirkişi atandı", description: null, event_type: "other", created_at: "2026-03-01" },
  ],
};

function pendingTask(id: string, due: string) {
  return { id, case_id: "c1", title: `Görev ${id}`, description: null, due_date: due, status: "pending", assigned_to: null, created_at: "2026-01-01", completed_at: null };
}

beforeEach(() => {
  resetNav();
  getCase.mockReset();
  listCaseTasks.mockReset();
  listDocuments.mockReset();
  listCaseTasks.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
});

describe("CaseQuickView", () => {
  it("renders nothing without the onizle param", () => {
    setUrl("/davalar");
    const { container } = render(<CaseQuickView />);
    expect(container).toBeEmptyDOMElement();
    expect(getCase).not.toHaveBeenCalled();
  });

  it("shows the case summary, em dashes for missing values and tab shortcuts", async () => {
    setUrl("/dashboard?onizle=c1");
    getCase.mockResolvedValue(detail);

    render(<CaseQuickView />);

    const dialog = await screen.findByRole("dialog", { name: "Ticari Kira Uyarlama Davası" });
    expect(getCase).toHaveBeenCalledWith("c1");
    expect(within(dialog).getByText("Deniz Arslan")).toBeInTheDocument();
    expect(within(dialog).getAllByText("—").length).toBeGreaterThanOrEqual(3); // karşı taraf, mahkeme, duruşma
    expect(within(dialog).getByRole("link", { name: "Davaya git →" })).toHaveAttribute("href", "/davalar/c1");
    expect(within(dialog).getByRole("link", { name: "Görevler" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
    // most recent event first
    const events = within(dialog).getAllByTestId("quickview-event");
    expect(events[0]).toHaveTextContent("Bilirkişi atandı");
  });

  it("shows at most 3 open tasks and pins the focused one", async () => {
    setUrl("/gorevler?onizle=c1&odak=gorev%3At5");
    getCase.mockResolvedValue(detail);
    listCaseTasks.mockResolvedValue([
      pendingTask("t1", "2026-10-01"),
      pendingTask("t2", "2026-10-02"),
      pendingTask("t3", "2026-10-03"),
      pendingTask("t4", "2026-10-04"),
      pendingTask("t5", "2026-10-05"),
    ]);

    render(<CaseQuickView />);

    const dialog = await screen.findByRole("dialog");
    const tasks = within(dialog).getAllByTestId("quickview-task");
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toHaveTextContent("Görev t5");
    expect(tasks[0]).toHaveAttribute("data-focused", "true");
    expect(within(dialog).getByRole("link", { name: "Tümü (5) →" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
  });

  it("shows a not-found message for a 404", async () => {
    setUrl("/davalar?onizle=missing");
    getCase.mockRejectedValue(new ApiError("Case not found", 404));

    render(<CaseQuickView />);

    expect(await screen.findByText(/dava bulunamadı veya erişiminiz yok/i)).toBeInTheDocument();
  });

  it("retries after a generic error", async () => {
    setUrl("/davalar?onizle=c1");
    getCase.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(detail);

    render(<CaseQuickView />);
    await userEvent.click(await screen.findByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByRole("dialog", { name: "Ticari Kira Uyarlama Davası" })).toBeInTheDocument();
    expect(getCase).toHaveBeenCalledTimes(2);
  });

  it("closes with Escape and with the close button, keeping other params", async () => {
    setUrl("/davalar?kategori=icra&onizle=c1&odak=gorev%3At1");
    getCase.mockResolvedValue(detail);

    render(<CaseQuickView />);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?kategori=icra", { scroll: false });

    await userEvent.click(screen.getByRole("button", { name: "Önizlemeyi kapat" }));
    expect(nav.replace).toHaveBeenCalledTimes(2);
  });
});

describe("pickWithFocus", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("keeps the first items when the focus is among them or absent", () => {
    expect(pickWithFocus(items, undefined).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(pickWithFocus(items, "b").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("pins a focused item that would otherwise be cut", () => {
    expect(pickWithFocus(items, "d").map((i) => i.id)).toEqual(["d", "a", "b"]);
    expect(pickWithFocus(items, "zzz").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
