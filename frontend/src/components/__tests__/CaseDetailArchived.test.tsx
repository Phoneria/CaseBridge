import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const getCaseHearings = vi.fn().mockResolvedValue([]);
const unarchiveCase = vi.fn();
const updateTaskStatus = vi.fn();
const addCaseEvent = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
  unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  updateCase: vi.fn(),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  uploadDocument: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const colleague = { id: "u-colleague", role: "lawyer", full_name: "Mehmet Avukat" };

const baseCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: null,
  case_type: "sozlesme",
  court: null,
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
  client_role: "plaintiff",
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [{ id: "p1", name: "Deniz Arslan", role: "plaintiff", is_client: true, counsel_name: null, sort_order: 0 }],
  is_archived: false,
  is_precedent: false,
  timeline: [{ id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" }],
};
const closedCase = { ...baseCase, status: "kapali", outcome: "won", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi." };
const archivedCase = { ...closedCase, is_archived: true };
const task = { id: "t1", title: "Vekalet", status: "pending", due_date: null, description: null };
const document = { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: "Karar metni" };

async function renderCase(caseDetail: object, me: object = owner) {
  getCase.mockResolvedValue(caseDetail);
  getMe.mockResolvedValue(me);
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: "Sözleşmenin Feshi Davası" });
  await waitFor(() => expect(getMe).toHaveBeenCalled());
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, unarchiveCase, updateTaskStatus, addCaseEvent]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([document]);
  listCaseTasks.mockResolvedValue([task]);
});

describe("decision card", () => {
  it("is shown on the overview of a closed case", async () => {
    await renderCase(closedCase);
    const card = screen.getByRole("region", { name: "Karar bilgisi" });
    expect(card).toHaveTextContent("Kazanıldı");
    expect(card).toHaveTextContent("Karar tebliğ edildi.");
  });

  it("is not shown for an open case", async () => {
    await renderCase(baseCase);
    expect(screen.queryByRole("region", { name: "Karar bilgisi" })).toBeNull();
  });
});

describe("archived case", () => {
  it("shows the archive banner with an unarchive button for the responsible lawyer", async () => {
    unarchiveCase.mockResolvedValue({ ...archivedCase, is_archived: false });
    await renderCase(archivedCase);
    expect(screen.getByRole("note")).toHaveTextContent("Bu dava arşivlendi; salt okunur.");

    await userEvent.click(screen.getByRole("button", { name: "Arşivden çıkar" }));

    await waitFor(() => expect(unarchiveCase).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByRole("note")).toBeNull());
  });

  it("shows the banner without the button to someone who may not manage the case", async () => {
    await renderCase(archivedCase, colleague);
    expect(screen.getByRole("note")).toHaveTextContent("Bu dava arşivlendi; salt okunur.");
    expect(screen.queryByRole("button", { name: "Arşivden çıkar" })).toBeNull();
  });

  it("shows no banner on a case that is not archived", async () => {
    await renderCase(closedCase);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("hides the edit buttons of the parties and dispute cards", async () => {
    await renderCase(archivedCase);
    expect(screen.queryByRole("button", { name: "Tarafları düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeNull();
  });

  it("keeps the edit buttons on a case that may be changed", async () => {
    await renderCase(baseCase);
    expect(screen.getByRole("button", { name: "Tarafları düzenle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeInTheDocument();
  });

  it("hides the edit buttons from a lawyer who may not manage the case, open or not", async () => {
    await renderCase(baseCase, colleague);
    expect(screen.queryByRole("button", { name: "Tarafları düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeNull();
  });

  it("has no event form on the developments tab", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gelişme Başlığı")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ekle" })).toBeNull();
  });

  it("has no task form and read-only task checkboxes on the tasks tab", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Görevler" }));
    expect(screen.getByText("Vekalet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Görev Başlığı")).toBeNull();
    expect(screen.queryByRole("button", { name: "Görev Ekle" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Vekalet tamamlandı olarak işaretle" })).toBeDisabled();
  });

  it("has no upload zone or delete button on the documents tab, but keeps download", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    expect(await screen.findByRole("button", { name: "İndir" })).toBeInTheDocument();
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByLabelText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("still offers upload and delete on an open case", async () => {
    await renderCase(baseCase);
    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    expect(await screen.findByText(/Belge Yükle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it("shows the server's message when a write is refused anyway (the case was archived elsewhere)", async () => {
    addCaseEvent.mockRejectedValueOnce(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
    await renderCase(baseCase);
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    await userEvent.type(screen.getByLabelText("Tarih"), "2026-10-02");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Not");
    await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
    expect(await screen.findByText("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.")).toBeInTheDocument();
  });
});
