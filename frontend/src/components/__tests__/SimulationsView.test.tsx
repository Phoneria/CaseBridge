import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
const push = nav.push;

const listAllSimulations = vi.fn();
const listCourtroomScenarios = vi.fn();
const listCourtroomSessions = vi.fn();
const createCourtroomSession = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  listCourtroomScenarios: (...args: unknown[]) => listCourtroomScenarios(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
  createCourtroomSession: (...args: unknown[]) => createCourtroomSession(...args),
}));

import { SimulationsView } from "@/components/SimulationsView";

const sim = {
  id: "s1",
  case_id: "c1",
  case_name: "Sözleşmenin Feshi Davası",
  case_number: "2026/1",
  status: "completed",
  error_message: null,
  started_at: "2026-01-01",
  completed_at: "2026-01-01",
  result: {
    summary: "Özet",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 70, confidence: "medium" },
    ai_disclaimer: "Bu bir yapay zeka tahminidir.",
    requires_verification: false,
  },
  current_stage: null,
  failure_category: null,
};

beforeEach(() => {
  resetNav();
  setUrl("/simulasyonlar");
  listAllSimulations.mockReset();
  listCourtroomScenarios.mockReset().mockResolvedValue([]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
  createCourtroomSession.mockReset();
  push.mockReset();
});

describe("SimulationsView", () => {
  it("lists simulations across cases with the case name", async () => {
    listAllSimulations.mockResolvedValue([sim]);

    render(<SimulationsView />);

    await waitFor(() => expect(screen.getByText("Duruşma Simülasyonları")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Dosya analizleri" }));
    await waitFor(() => expect(screen.getByText(/Sözleşmenin Feshi Davası/)).toBeInTheDocument());
    expect(screen.getByText("AI Değerlendirmesi: %70")).toBeInTheDocument();
  });

  it("shows an empty state when there are no simulations", async () => {
    listAllSimulations.mockResolvedValue([]);

    render(<SimulationsView />);

    await waitFor(() => expect(screen.getByText("Duruşma Simülasyonları")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Dosya analizleri" }));
    expect(screen.getByText(/henüz dosya analizi yok/i)).toBeInTheDocument();
  });

  it("links case names in file analyses to the preview", async () => {
    listCourtroomScenarios.mockResolvedValue([]);
    listCourtroomSessions.mockResolvedValue([]);
    listAllSimulations.mockResolvedValue([sim]);
    render(<SimulationsView />);

    fireEvent.click(await screen.findByRole("button", { name: "Dosya analizleri" }));

    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/simulasyonlar?onizle=c1");
  });
});
