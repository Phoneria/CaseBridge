import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const getCaseHearings = vi.fn().mockResolvedValue([]);
const updateCase = vi.fn();
const unarchiveCase = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
  updateCase: (...args: unknown[]) => updateCase(...args),
  unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  uploadDocument: vi.fn(),
  addCaseEvent: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const colleague = { id: "u-colleague", role: "lawyer", full_name: "Mehmet Avukat" };
const admin = { id: "u-admin", role: "admin", full_name: "Yönetici" };

const baseCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: "Mavi Yapı A.Ş.",
  case_type: "sozlesme",
  court: "İstanbul 2. Asliye Hukuk Mahkemesi",
  court_file_number: null,
  assigned_lawyer_id: "u-owner",
  opening_date: "2026-01-12",
  next_hearing_date: null,
  status: "devam_eden",
  outcome: "ongoing",
  decision_date: null,
  closing_note: null,
  case_value: null,
  description: null,
  client_role: null,
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [],
  is_archived: false,
  is_precedent: false,
  timeline: [
    { id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" },
  ],
};
const closedCase = { ...baseCase, status: "kapali", outcome: "won", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi." };
const archivedCase = { ...closedCase, is_archived: true };

async function renderCase(caseDetail: object, me: object | null = owner) {
  getCase.mockResolvedValue(caseDetail);
  if (me) getMe.mockResolvedValue(me);
  else getMe.mockRejectedValue(new ApiError("Oturum bulunamadı", 401));
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: caseDetail === undefined ? "" : (caseDetail as typeof baseCase).case_name });
}

async function menuItems() {
  await userEvent.click(await screen.findByRole("button", { name: "İşlemler" }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, updateCase, unarchiveCase]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
  listCaseTasks.mockResolvedValue([]);
});

describe("İşlemler menu on the case page", () => {
  it("offers edit and close to the responsible lawyer of an open case", async () => {
    await renderCase(baseCase, owner);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("offers edit, reopen and archive on a closed case", async () => {
    await renderCase(closedCase, owner);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Yeniden aç", "Arşivle"]);
  });

  it("offers only unarchive on an archived case", async () => {
    await renderCase(archivedCase, owner);
    expect(await menuItems()).toEqual(["Arşivden çıkar"]);
  });

  it("is available to an admin on any case of the firm", async () => {
    await renderCase(baseCase, admin);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("is available to an admin on a case without a responsible lawyer", async () => {
    await renderCase({ ...baseCase, assigned_lawyer_id: null }, admin);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("is hidden from another lawyer and from the owner of nothing", async () => {
    await renderCase(baseCase, colleague);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
  });

  it("is hidden for a case without a responsible lawyer when the user is a lawyer", async () => {
    await renderCase({ ...baseCase, assigned_lawyer_id: null }, owner);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
  });

  it("stays hidden, and the page still loads, when the current user cannot be read", async () => {
    await renderCase(baseCase, null);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sözleşmenin Feshi Davası" })).toBeInTheDocument();
  });
});

describe("status badges in the header", () => {
  it("shows the status of an open case without an outcome badge", async () => {
    await renderCase(baseCase);
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Devam Eden")).toBeInTheDocument();
    expect(within(group).queryByText("Kazanıldı")).toBeNull();
  });

  it.each([
    ["won", "Kazanıldı", "text-emerald-700"],
    ["lost", "Kaybedildi", "text-red-700"],
    ["settled", "Sulh", "text-slate-700"],
  ])("adds the %s outcome badge, in its own colour, to a closed case", async (outcome, label, tone) => {
    await renderCase({ ...closedCase, outcome });
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Kapalı")).toBeInTheDocument();
    expect(within(group).getByText(label)).toBeInTheDocument();
    expect(within(group).getByText(label)).toHaveClass(tone);
  });

  it("shows no outcome badge for a case closed before outcomes were recorded", async () => {
    await renderCase({ ...closedCase, outcome: "ongoing" });
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Kapalı")).toBeInTheDocument();
    expect(within(group).queryByText("Devam ediyor")).toBeNull();
  });
});

describe("Bilgileri düzenle", () => {
  it("opens the dialog from the menu, saves, updates the page and returns focus to the menu button", async () => {
    updateCase.mockResolvedValue({ ...baseCase, case_name: "Yeni Dava Adı", timeline: undefined });
    await renderCase(baseCase);

    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Bilgileri düzenle" }));
    const dialog = screen.getByRole("dialog", { name: "Bilgileri düzenle" });
    const name = within(dialog).getByLabelText(/^Dava adı/);
    expect(name).toHaveFocus();
    await userEvent.clear(name);
    await userEvent.type(name, "Yeni Dava Adı");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateCase).toHaveBeenCalledWith("c1", expect.objectContaining({ case_name: "Yeni Dava Adı" }));
    expect(screen.getByRole("heading", { name: "Yeni Dava Adı" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İşlemler" })).toHaveFocus();

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server's message when saving fails", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.", 403));
    await renderCase(baseCase);
    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Bilgileri düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.");
    expect(screen.getByRole("dialog", { name: "Bilgileri düzenle" })).toBeInTheDocument();
  });
});

describe("Arşivden çıkar", () => {
  it("unarchives straight from the menu and swaps the menu for a closed case's", async () => {
    unarchiveCase.mockResolvedValue({ ...archivedCase, is_archived: false, timeline: undefined });
    await renderCase(archivedCase);

    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));

    await waitFor(() => expect(unarchiveCase).toHaveBeenCalledTimes(1));
    expect(unarchiveCase).toHaveBeenCalledWith("c1");
    await waitFor(async () => expect(await menuItems()).toEqual(["Bilgileri düzenle", "Yeniden aç", "Arşivle"]));
  });

  it("shows the server's message when it fails, and a Turkish fallback otherwise", async () => {
    unarchiveCase.mockRejectedValueOnce(new ApiError("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.", 403));
    await renderCase(archivedCase);
    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.");

    unarchiveCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Dava arşivden çıkarılamadı. Lütfen tekrar deneyin."));
  });
});
