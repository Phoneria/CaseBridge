import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const closeCase = vi.fn();
const reopenCase = vi.fn();
const archiveCase = vi.fn();
const uploadDocument = vi.fn();
const unarchiveCase = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  closeCase: (...args: unknown[]) => closeCase(...args),
  reopenCase: (...args: unknown[]) => reopenCase(...args),
  archiveCase: (...args: unknown[]) => archiveCase(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  updateCase: vi.fn(),
  unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  addCaseEvent: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const openCase = {
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
  client_role: null,
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [],
  is_archived: false,
  is_precedent: false,
  timeline: [{ id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" }],
};
const closeEvent = { id: "e2", event_date: "2026-10-01", title: "Dava kapatıldı — Kazanıldı", description: null, event_type: "other", created_at: "2026-10-01" };
const closedCase = { ...openCase, status: "kapali", outcome: "won", decision_date: "2026-10-01" };
const closedDetail = { ...closedCase, timeline: [...openCase.timeline, closeEvent] };

async function renderCase(caseDetail: object) {
  getCase.mockResolvedValue(caseDetail);
  getMe.mockResolvedValue(owner);
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: "Sözleşmenin Feshi Davası" });
}

async function pick(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: "İşlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, closeCase, reopenCase, archiveCase, uploadDocument, unarchiveCase]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
  listCaseTasks.mockResolvedValue([
    { id: "t1", title: "Vekalet", status: "pending", due_date: null, description: null },
    { id: "t2", title: "Dilekçe", status: "completed", due_date: null, description: null },
  ]);
});

describe("Davayı kapat", () => {
  it("closes the case, shows the outcome badge and reloads the timeline", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    const dialog = screen.getByRole("dialog", { name: "Davayı kapat" });
    expect(within(dialog).getByText("Bu davada 1 bekleyen görev var.")).toBeInTheDocument();

    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closeCase).toHaveBeenCalledWith("c1", { outcome: "won", decision_date: todayLocalISO() });
    const badges = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(badges).getByText("Kapalı")).toBeInTheDocument();
    expect(within(badges).getByText("Kazanıldı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İşlemler" })).toHaveFocus();

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(await screen.findByText("Dava kapatıldı — Kazanıldı")).toBeInTheDocument();
  });

  it("uploads the decision document and refreshes the document list", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    uploadDocument.mockResolvedValue({ id: "d1" });
    listDocuments.mockResolvedValue([
      { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: null },
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), new File(["%PDF"], "karar.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("karar.pdf")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Dava kapatıldı ancak karar belgesi yüklenemedi.")).toBeNull();
  });

  it("tells the user the case is closed when only the document failed", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    uploadDocument.mockRejectedValue(new Error("boom"));
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), new File(["%PDF"], "karar.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Dava kapatıldı ancak karar belgesi yüklenemedi.");
    expect(within(screen.getByRole("group", { name: "Dava durumu" })).getByText("Kapalı")).toBeInTheDocument();
  });

  it("still shows the closed case when the reload after closing fails", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockRejectedValue(new Error("down"));
    await userEvent.click(screen.getByRole("radio", { name: "Sulh" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(screen.getByRole("group", { name: "Dava durumu" })).getByText("Kapalı")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sözleşmenin Feshi Davası" })).toBeInTheDocument();
  });
});

describe("Yeniden aç", () => {
  it("asks for confirmation, reopens and reloads the timeline", async () => {
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    const dialog = screen.getByRole("dialog", { name: "Dava yeniden açılsın mı?" });
    expect(within(dialog).getByText("Sonuç ve karar bilgisi temizlenecek; kapanış kaydı zaman çizelgesinde kalır.")).toBeInTheDocument();

    const reopenEvent = { ...closeEvent, id: "e3", title: "Dava yeniden açıldı" };
    reopenCase.mockResolvedValue({ ...openCase });
    getCase.mockResolvedValue({ ...openCase, timeline: [...closedDetail.timeline, reopenEvent] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Yeniden aç" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(reopenCase).toHaveBeenCalledWith("c1");
    const badges = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(badges).getByText("Devam Eden")).toBeInTheDocument();
    expect(within(badges).queryByText("Kazanıldı")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(await screen.findByText("Dava yeniden açıldı")).toBeInTheDocument();
  });

  it("does nothing when cancelled", async () => {
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reopenCase).not.toHaveBeenCalled();
  });

  it("shows the server's message when reopening fails", async () => {
    reopenCase.mockRejectedValueOnce(new ApiError("Dava zaten açık.", 409));
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Yeniden aç" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava zaten açık.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Arşivle", () => {
  it("asks for confirmation, archives and swaps the menu", async () => {
    await renderCase(closedDetail);
    await pick("Arşivle");
    const dialog = screen.getByRole("dialog", { name: "Dava arşivlensin mi?" });
    expect(within(dialog).getByText("Arşivli dava salt okunur olur.")).toBeInTheDocument();

    archiveCase.mockResolvedValue({ ...closedCase, is_archived: true });
    await userEvent.click(within(dialog).getByRole("button", { name: "Arşivle" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(archiveCase).toHaveBeenCalledWith("c1");
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Arşivden çıkar"]);
  });

  it("falls back to a Turkish message when archiving fails without a server message", async () => {
    archiveCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await renderCase(closedDetail);
    await pick("Arşivle");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Arşivle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava arşivlenemedi. Lütfen tekrar deneyin.");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function closeAsWon() {
  await pick("Davayı kapat");
  await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
  await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

async function confirmIn(dialogName: string, button: string) {
  await userEvent.click(within(screen.getByRole("dialog", { name: dialogName })).getByRole("button", { name: button }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("final review fixes", () => {
  it("limits the decision date to the case's opening date", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    expect(screen.getByLabelText("Karar tarihi")).toHaveAttribute("min", openCase.opening_date);
  });

  it("applies only the latest reload: close then reopen, the first reload resolving last", async () => {
    await renderCase(openCase);
    const afterClose = deferred<object>();
    const afterReopen = deferred<object>();
    getCase.mockReturnValueOnce(afterClose.promise).mockReturnValueOnce(afterReopen.promise);
    closeCase.mockResolvedValue(closedCase);
    reopenCase.mockResolvedValue({ ...openCase });

    await closeAsWon();
    await pick("Yeniden aç");
    await confirmIn("Dava yeniden açılsın mı?", "Yeniden aç");

    const reopenEvent = { ...closeEvent, id: "e3", title: "Dava yeniden açıldı" };
    await act(async () => afterReopen.resolve({ ...openCase, timeline: [...closedDetail.timeline, reopenEvent] }));
    await act(async () => afterClose.resolve(closedDetail));

    const badges = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(badges).getByText("Devam Eden")).toBeInTheDocument();
    expect(within(badges).queryByText("Kazanıldı")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(await screen.findByText("Dava yeniden açıldı")).toBeInTheDocument();
  });

  it("clears the previous action error when a new action is picked", async () => {
    await renderCase(openCase);
    const afterClose = deferred<object>();
    getCase.mockReturnValueOnce(afterClose.promise);
    closeCase.mockResolvedValue(closedCase);
    archiveCase.mockResolvedValue({ ...closedCase, is_archived: true });
    unarchiveCase.mockRejectedValueOnce(new ApiError("Dava arşivden çıkarılamadı: sunucu meşgul.", 503));

    await closeAsWon();
    await pick("Arşivle");
    await confirmIn("Dava arşivlensin mi?", "Arşivle");
    await pick("Arşivden çıkar");
    expect(await screen.findByText("Dava arşivden çıkarılamadı: sunucu meşgul.")).toBeInTheDocument();

    // The reload started after closing answers now: the menu offers the closed-case actions again.
    await act(async () => afterClose.resolve(closedDetail));
    await pick("Bilgileri düzenle");

    expect(screen.getByRole("dialog", { name: "Bilgileri düzenle" })).toBeInTheDocument();
    expect(screen.queryByText("Dava arşivden çıkarılamadı: sunucu meşgul.")).toBeNull();
  });
});

