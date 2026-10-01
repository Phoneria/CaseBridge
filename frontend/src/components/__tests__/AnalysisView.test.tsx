import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const getCases = vi.fn();
const listAllSimulations = vi.fn();
const startSimulation = vi.fn();
const getAiStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getCases: (...args: unknown[]) => getCases(...args),
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  startSimulation: (...args: unknown[]) => startSimulation(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
}));

import { AnalysisView } from "@/components/ai/AnalysisView";

const cases = [
  { id: "c1", case_name: "Ticari Kira Uyarlama Davası", case_number: "2026/14", client_name: "Deniz Arslan" },
  { id: "c2", case_name: "İşçilik Alacakları Davası", case_number: "2026/15", client_name: "Ahmet Yılmaz" },
];

const completedSim = {
  id: "s1",
  case_id: "c1",
  case_name: "Ticari Kira Uyarlama Davası",
  case_number: "2026/14",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result: {
    summary: "Özet",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 72, confidence: "medium" },
    ai_disclaimer: "Bu bir yapay zeka tahminidir.",
    requires_verification: false,
  },
};

beforeEach(() => {
  resetNav();
  setUrl("/ai/analiz");
  getCases.mockReset().mockResolvedValue(cases);
  listAllSimulations.mockReset().mockResolvedValue([]);
  startSimulation.mockReset();
  getAiStatus.mockReset().mockResolvedValue({ provider: "ollama", configured: true, error: null });
});

describe("AnalysisView", () => {
  it("loads only active cases and keeps the start button disabled until a case is chosen", async () => {
    render(<AnalysisView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dosya Analizi" })).toBeInTheDocument();
    expect(getCases).toHaveBeenCalledWith({ active: true });
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeDisabled();
  });

  it("filters cases with Turkish-aware search and starts an analysis", async () => {
    startSimulation.mockResolvedValue({ id: "s9" });
    render(<AnalysisView />);

    await userEvent.type(await screen.findByLabelText("Dava ara"), "İŞÇİLİK");
    const list = screen.getByRole("list", { name: "Davalar" });
    expect(within(list).queryByText("Ticari Kira Uyarlama Davası")).not.toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: /İşçilik Alacakları Davası/ }));

    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(startSimulation).toHaveBeenCalledWith("c2");
    expect(nav.push).toHaveBeenCalledWith("/davalar/c2?sekme=ai");
  });

  it("preselects the case from ?dava=", async () => {
    setUrl("/ai/analiz?dava=c1");
    render(<AnalysisView />);
    expect(await screen.findByText("Seçili dava:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticari Kira Uyarlama Davası/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeEnabled();
  });

  it("scrolls to the #raporlar section once loading finishes", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.location.hash = "#raporlar";
    try {
      render(<AnalysisView />);
      await screen.findByRole("heading", { level: 1, name: "Dosya Analizi" });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toHaveAttribute("id", "raporlar");
    } finally {
      window.location.hash = "";
      // @ts-expect-error restore jsdom default (undefined)
      delete Element.prototype.scrollIntoView;
    }
  });

  it("shows a start error inside the card", async () => {
    setUrl("/ai/analiz?dava=c1");
    startSimulation.mockRejectedValue(new Error("boom"));
    render(<AnalysisView />);
    await userEvent.click(await screen.findByRole("button", { name: "Analizi başlat" }));
    expect(await screen.findByText("Analiz başlatılamadı. Lütfen tekrar deneyin.")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("warns when the AI model is not configured", async () => {
    getAiStatus.mockResolvedValue({ provider: "ollama", configured: false, error: "x" });
    render(<AnalysisView />);
    expect(await screen.findByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
  });

  it("lists reports with preview links", async () => {
    listAllSimulations.mockResolvedValue([completedSim]);
    render(<AnalysisView />);

    const reports = await screen.findByRole("region", { name: "Raporlar" });
    expect(within(reports).getByRole("link", { name: "2026/14 - Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/ai/analiz?onizle=c1");
    expect(within(reports).getByText("AI Değerlendirmesi: %72")).toBeInTheDocument();
  });

  it("shows an empty state without reports", async () => {
    render(<AnalysisView />);
    expect(await screen.findByText("Henüz dosya analizi yok.")).toBeInTheDocument();
  });
});
