import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const listAllSimulations = vi.fn();
const listCourtroomSessions = vi.fn();
const getAiStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
}));

import { AiHubView } from "@/components/ai/AiHubView";

const result = {
  summary: "Özet",
  strong_points: [],
  weak_points: [],
  opposing_arguments: [],
  missing_information: [],
  possible_scenarios: [],
  questions: [],
  recommended_actions: [],
  assessment: { score: 72, confidence: "medium" },
  ai_disclaimer: "x",
  requires_verification: false,
};

const sim = {
  id: "s1",
  case_id: "c1",
  case_name: "Kira Davası",
  case_number: "2026/1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result,
};

function session(id: string, status: string, updated_at: string, total_score: number | null) {
  return {
    id,
    scenario_id: "sc",
    scenario_title: `Senaryo ${id}`,
    chosen_role: "defendant",
    status,
    phase: "verdict",
    current_actor: "system",
    round_number: 6,
    max_rounds: 6,
    total_score,
    created_at: updated_at,
    updated_at,
  };
}

beforeEach(() => {
  listAllSimulations.mockReset().mockResolvedValue([]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
  getAiStatus.mockReset().mockResolvedValue({ provider: "ollama", configured: true, error: null });
});

describe("AiHubView", () => {
  it("shows the hero, stats and model status", async () => {
    listAllSimulations.mockResolvedValue([sim, { ...sim, id: "s2", status: "failed", result: null }]);
    listCourtroomSessions.mockResolvedValue([session("o1", "completed", "2026-09-02T10:00:00", 77)]);
    render(<AiHubView />);

    expect(await screen.findByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeInTheDocument();
    expect(await screen.findByText("Model: ollama · Hazır")).toBeInTheDocument();
    const stats = screen.getByText("Tamamlanan analiz").closest("dl")!;
    await waitFor(() => expect(within(stats).getByText("Tamamlanan analiz").nextSibling).toHaveTextContent("1"));
    expect(within(stats).getByText("Duruşma oturumu").nextSibling).toHaveTextContent("1");
    expect(within(stats).getByText("Son duruşma puanı").nextSibling).toHaveTextContent("77");
  });

  it("offers both products and continues an active session", async () => {
    listCourtroomSessions.mockResolvedValue([session("live", "active", "2026-09-03T10:00:00", null)]);
    render(<AiHubView />);

    expect(await screen.findByRole("link", { name: "Analiz başlat" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Raporları gör" })).toHaveAttribute("href", "/ai/analiz#raporlar");
    expect(screen.getByRole("link", { name: "Devam et: Senaryo live" })).toHaveAttribute("href", "/ai/durusma/oturum/live");
  });

  it("offers to enter the courtroom when no session is active", async () => {
    render(<AiHubView />);
    expect(await screen.findByRole("link", { name: "Duruşmaya gir" })).toHaveAttribute("href", "/ai/durusma");
  });

  it("lists recent AI activity with links", async () => {
    listAllSimulations.mockResolvedValue([sim]);
    listCourtroomSessions.mockResolvedValue([session("o1", "completed", "2026-09-02T10:00:00", 77)]);
    render(<AiHubView />);

    const list = await screen.findByRole("list", { name: "Son AI aktivitesi" });
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/ai/durusma/oturum/o1");
    expect(links[1]).toHaveAttribute("href", "/davalar/c1?sekme=ai");
  });

  it("shows an empty activity state and a settings warning", async () => {
    getAiStatus.mockResolvedValue({ provider: "ollama", configured: false, error: "x" });
    render(<AiHubView />);
    expect(await screen.findByText("Henüz AI aktivitesi yok.")).toBeInTheDocument();
    expect(await screen.findByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
  });

  it("shows an error when AI data cannot be loaded", async () => {
    listAllSimulations.mockRejectedValue(new Error("boom"));
    render(<AiHubView />);
    expect(await screen.findByText(/AI verileri yüklenemedi/)).toBeInTheDocument();
  });
});
