import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listAllSimulations = vi.fn();
const listCourtroomSessions = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
}));

import { DashboardAiCard } from "@/components/ai/DashboardAiCard";

const sim = {
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
    assessment: { score: 72, confidence: "high" },
    ai_disclaimer: "x",
    requires_verification: false,
  },
};

const session = {
  id: "o1",
  scenario_id: "sc",
  scenario_title: "Kira Uyarlama",
  chosen_role: "plaintiff",
  status: "completed",
  phase: "verdict",
  current_actor: "system",
  round_number: 6,
  max_rounds: 6,
  total_score: 81,
  created_at: "2026-09-02T10:00:00",
  updated_at: "2026-09-02T10:30:00",
};

beforeEach(() => {
  listAllSimulations.mockReset().mockResolvedValue([]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
});

describe("DashboardAiCard", () => {
  it("shows the latest analysis, latest session and shortcuts", async () => {
    listAllSimulations.mockResolvedValue([sim]);
    listCourtroomSessions.mockResolvedValue([session]);
    render(<DashboardAiCard />);

    expect(await screen.findByText("Ticari Kira Uyarlama Davası")).toBeInTheDocument();
    expect(screen.getByText("%72")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Raporu aç" })).toHaveAttribute("href", "/davalar/c1?sekme=ai");
    expect(screen.getByText("Kira Uyarlama")).toBeInTheDocument();
    expect(screen.getByText("81/100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oturumu aç" })).toHaveAttribute("href", "/ai/durusma/oturum/o1");
    expect(screen.getByRole("link", { name: "Dosya analizi başlat" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Duruşmaya gir" })).toHaveAttribute("href", "/ai/durusma");
    expect(screen.getByRole("link", { name: "Tümü →" })).toHaveAttribute("href", "/ai");
  });

  it("shows the AI disclaimer next to the analysis score", async () => {
    listAllSimulations.mockResolvedValue([{ ...sim, result: { ...sim.result, ai_disclaimer: "Model çıktısıdır." } }]);
    const { unmount } = render(<DashboardAiCard />);
    expect(await screen.findByText("Model çıktısıdır.")).toBeInTheDocument();
    unmount();

    listAllSimulations.mockResolvedValue([{ ...sim, result: { ...sim.result, ai_disclaimer: "" } }]);
    render(<DashboardAiCard />);
    expect(await screen.findByText("AI tahmini, kesin sonuç değildir.")).toBeInTheDocument();
  });

  it("shows empty states when there is no AI activity", async () => {
    render(<DashboardAiCard />);
    expect(await screen.findByText("Henüz analiz yok.")).toBeInTheDocument();
    expect(screen.getByText("Henüz oturum yok.")).toBeInTheDocument();
  });

  it("keeps the shortcuts and shows an inline error when AI data fails", async () => {
    listAllSimulations.mockRejectedValue(new Error("boom"));
    render(<DashboardAiCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("AI verileri yüklenemedi.");
    expect(screen.getByRole("link", { name: "Duruşmaya gir" })).toBeInTheDocument();
  });
});
