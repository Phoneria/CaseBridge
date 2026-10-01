import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const startSimulation = vi.fn();
const getSimulation = vi.fn();
const retrySimulation = vi.fn();
const uploadDocument = vi.fn();
const addCaseEvent = vi.fn();
const generateHandover = vi.fn();
const listCaseTasks = vi.fn();
const createTask = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  startSimulation: (...args: unknown[]) => startSimulation(...args),
  getSimulation: (...args: unknown[]) => getSimulation(...args),
  retrySimulation: (...args: unknown[]) => retrySimulation(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  generateHandover: (...args: unknown[]) => generateHandover(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  createTask: (...args: unknown[]) => createTask(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
}));

import { CaseDetailView } from "@/components/CaseDetailView";

const caseDetail = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: "Mavi Yapı A.Ş.",
  case_type: "sozlesme",
  court: "İstanbul 2. Asliye Hukuk Mahkemesi",
  status: "devam_eden",
  description: "Sözleşme feshi nedeniyle tazminat talebi.",
  timeline: [
    { id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" },
  ],
};

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");

  getCase.mockReset();
  listSimulations.mockReset();
  listDocuments.mockReset();
  startSimulation.mockReset();
  getSimulation.mockReset();
  retrySimulation.mockReset();
  uploadDocument.mockReset();
  addCaseEvent.mockReset();
  generateHandover.mockReset();
  listCaseTasks.mockReset();
  createTask.mockReset();
  updateTaskStatus.mockReset();
  listCaseTasks.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CaseDetailView", () => {
  it("renders the case overview with the AI card by default", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toBeInTheDocument();
  });

  it("renders the chronological timeline in the Gelişmeler tab", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
  });

  it("shows an empty state for documents when there are none", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    expect(screen.getByText(/henüz belge yok/i)).toBeInTheDocument();
  });

  const completedResult = {
    summary: "Özet",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 55, confidence: "low" },
    ai_disclaimer: "Bu bir yapay zeka tahminidir.",
    requires_verification: false,
  };

  const pendingSim = {
    id: "sim1",
    case_id: "c1",
    status: "pending",
    error_message: null,
    started_at: "2026-01-01",
    completed_at: null,
    result: null,
    current_stage: null,
    failure_category: null,
  };

  const completedSim = {
    ...pendingSim,
    status: "completed",
    completed_at: "2026-01-01",
    result: completedResult,
  };

  const failedSim = {
    ...pendingSim,
    id: "sim2",
    status: "failed",
    error_message: "Sağlayıcı zaman aşımına uğradı.",
    failure_category: "timeout",
    result: null,
  };

  it("starts a simulation, polls until it completes, and renders the result", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    startSimulation.mockResolvedValue(pendingSim);
    getSimulation.mockResolvedValueOnce(pendingSim).mockResolvedValueOnce(completedSim);

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(startSimulation).toHaveBeenCalledWith("c1");

    await waitFor(() => expect(getSimulation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Son AI değerlendirmesi")).toBeInTheDocument());
    expect(screen.getByText("%55")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Raporu aç" }));
    expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("AI Değerlendirmesi: %55")).toBeInTheDocument();
  });

  it("resumes polling an in-flight simulation found on load (refresh-safe)", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([pendingSim]);
    listDocuments.mockResolvedValue([]);
    getSimulation.mockResolvedValue(completedSim);

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await waitFor(() => expect(getSimulation).toHaveBeenCalledWith("c1", "sim1"));
    await userEvent.click(screen.getByRole("tab", { name: "CaseBridge AI" }));
    await waitFor(() => expect(screen.getByText("AI Değerlendirmesi: %55")).toBeInTheDocument());
  });

  it("offers a retry button for a failed simulation and re-polls after retrying", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([failedSim]);
    listDocuments.mockResolvedValue([]);
    retrySimulation.mockResolvedValue({ ...pendingSim, id: "sim3" });
    getSimulation.mockResolvedValue({ ...completedSim, id: "sim3" });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "CaseBridge AI" }));
    expect(screen.getByText(/sağlayıcı zaman aşımına uğradı/i)).toBeInTheDocument();
    expect(screen.getByText(/Analiz durumu: Başarısız/)).toBeInTheDocument();
    expect(screen.queryByText(/failed|Simülasyon/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /tekrar dene/i }));

    await waitFor(() => expect(retrySimulation).toHaveBeenCalledWith("c1", "sim2"));
    await waitFor(() => expect(screen.getByText("AI Değerlendirmesi: %55")).toBeInTheDocument());
  });

  it("shows an analysis (not simulation) error when starting fails", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    startSimulation.mockRejectedValue(new Error("boom"));

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: "CaseBridge AI" }));
    await userEvent.click(screen.getByRole("button", { name: /analiz/i }));

    expect(await screen.findByText("Analiz başlatılamadı. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });

  it("uploads a document and shows it in the list", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "d1", case_id: "c1", filename: "sozlesme.pdf", file_type: "pdf", extracted_text: null, uploaded_at: "2026-01-01" },
    ]);
    uploadDocument.mockResolvedValue({ id: "d1", filename: "sozlesme.pdf" });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    const file = new File(["icerik"], "sozlesme.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/belge yükle/i);
    await userEvent.upload(input, file);

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith("c1", file));
    await waitFor(() => expect(screen.getByText("sozlesme.pdf")).toBeInTheDocument());
  });

  it("adds a development event to the timeline", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    addCaseEvent.mockResolvedValue({
      id: "e2",
      event_date: "2026-03-01",
      title: "Bilirkişi raporu alındı",
      description: null,
      event_type: "other",
      created_at: "2026-03-01",
    });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Bilirkişi raporu alındı");
    await userEvent.type(screen.getByLabelText("Tarih"), "2026-03-01");
    await userEvent.click(screen.getByRole("button", { name: /ekle/i }));

    await waitFor(() => expect(addCaseEvent).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Bilirkişi raporu alındı")).toBeInTheDocument());
  });

  it("generates a case handover report and displays it", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    generateHandover.mockResolvedValue({
      case_id: "c1",
      case_overview: {
        case_number: "2026/1",
        case_name: "Sözleşmenin Feshi Davası",
        client_name: "Deniz Arslan",
        opposing_party: "Mavi Yapı A.Ş.",
        case_type: "sozlesme",
        court: "İstanbul 2. Asliye Hukuk Mahkemesi",
        status: "devam_eden",
        opening_date: "2026-01-12",
      },
      timeline: [],
      current_situation: "Dava devam ediyor.",
      key_documents: [],
      important_arguments: ["Sözleşme ihlali açıkça belgelenmiştir."],
      risks: ["Karşı taraf itiraz edebilir."],
      pending_tasks: [],
      upcoming_dates: [],
      recommended_next_steps: ["Bilirkişi raporunu takip edin."],
    });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Devir Raporu" }));
    await userEvent.click(screen.getByRole("button", { name: /devir raporu oluştur/i }));

    await waitFor(() => expect(generateHandover).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Dava devam ediyor.")).toBeInTheDocument();
    expect(screen.getByText("Sözleşme ihlali açıkça belgelenmiştir.")).toBeInTheDocument();
    expect(screen.getByText("Bilirkişi raporunu takip edin.")).toBeInTheDocument();
  });

  it("shows an error state when the case fails to load", async () => {
    getCase.mockRejectedValue(new Error("boom"));
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText(/dava yüklenemedi/i)).toBeInTheDocument());
  });

  it("lists tasks and lets the user add a new one", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    listCaseTasks.mockResolvedValue([
      {
        id: "t1",
        case_id: "c1",
        title: "Bilirkişi raporunu incele",
        description: null,
        due_date: "2026-09-01",
        status: "pending",
        assigned_to: null,
        created_at: "2026-01-01",
        completed_at: null,
      },
    ]);
    createTask.mockResolvedValue({
      id: "t2",
      case_id: "c1",
      title: "Tebligat kaydı talep et",
      description: null,
      due_date: null,
      status: "pending",
      assigned_to: null,
      created_at: "2026-01-02",
      completed_at: null,
    });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Görevler" }));
    expect(await screen.findByText("Bilirkişi raporunu incele")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Görev Başlığı"), "Tebligat kaydı talep et");
    await userEvent.click(screen.getByRole("button", { name: /görev ekle/i }));

    await waitFor(() => expect(createTask).toHaveBeenCalledWith("c1", { title: "Tebligat kaydı talep et" }));
    expect(await screen.findByText("Tebligat kaydı talep et")).toBeInTheDocument();
  });

  it("marks a task completed when its checkbox is toggled", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);
    listCaseTasks.mockResolvedValue([
      {
        id: "t1",
        case_id: "c1",
        title: "Bilirkişi raporunu incele",
        description: null,
        due_date: null,
        status: "pending",
        assigned_to: null,
        created_at: "2026-01-01",
        completed_at: null,
      },
    ]);
    updateTaskStatus.mockResolvedValue({
      id: "t1",
      case_id: "c1",
      title: "Bilirkişi raporunu incele",
      description: null,
      due_date: null,
      status: "completed",
      assigned_to: null,
      created_at: "2026-01-01",
      completed_at: "2026-01-03",
    });

    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: "Görevler" }));
    await screen.findByText("Bilirkişi raporunu incele");

    await userEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith("c1", "t1", "completed"));
  });

  it("opens the tab named in ?sekme=", async () => {
    setUrl("/davalar/c1?sekme=gorevler");
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Görevler" })).toHaveAttribute("aria-selected", "true"));
  });

  it("falls back to Genel Bakış for an unknown ?sekme=", async () => {
    setUrl("/davalar/c1?sekme=yok");
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Genel Bakış" })).toHaveAttribute("aria-selected", "true"));
  });

  it("opens the AI tab from ?sekme=ai and the legacy ?sekme=simulasyonlar", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    setUrl("/davalar/c1?sekme=ai");
    const { unmount } = render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("Bu dava için henüz AI analizi yapılmadı.")).toBeInTheDocument();
    unmount();

    setUrl("/davalar/c1?sekme=simulasyonlar");
    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true"));
  });

  it("writes the selected tab to the URL", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);
    await userEvent.click(await screen.findByRole("tab", { name: "Belgeler" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar/c1?sekme=belgeler", { scroll: false });

    await userEvent.click(screen.getByRole("tab", { name: "Genel Bakış" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar/c1", { scroll: false });
  });
});
