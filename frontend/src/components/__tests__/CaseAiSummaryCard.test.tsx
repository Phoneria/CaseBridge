import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseAiSummaryCard } from "@/components/ai/CaseAiSummaryCard";
import type { Simulation } from "@/types";

const completed = {
  id: "s1",
  case_id: "c1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result: {
    summary: "Kiracı lehine güçlü deliller var.",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 72, confidence: "high" },
    ai_disclaimer: "Bu bir yapay zeka tahminidir.",
    requires_verification: false,
  },
} as unknown as Simulation;

describe("CaseAiSummaryCard", () => {
  it("invites the first analysis when there is none", async () => {
    const onStart = vi.fn();
    render(<CaseAiSummaryCard simulations={[]} running={false} onStart={onStart} onOpenReport={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("summarises the latest analysis with its disclaimer", async () => {
    const onOpenReport = vi.fn();
    const onStart = vi.fn();
    render(<CaseAiSummaryCard simulations={[completed]} running={false} onStart={onStart} onOpenReport={onOpenReport} />);

    expect(screen.getByText("Son AI değerlendirmesi")).toBeInTheDocument();
    expect(screen.getByText("%72")).toBeInTheDocument();
    expect(screen.getByText("Yüksek güven")).toBeInTheDocument();
    expect(screen.getByText("Kiracı lehine güçlü deliller var.")).toBeInTheDocument();
    expect(screen.getByText("Bu bir yapay zeka tahminidir.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Raporu aç" }));
    expect(onOpenReport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yeniden analiz et" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows progress while an analysis runs", () => {
    render(
      <CaseAiSummaryCard
        simulations={[completed, { ...completed, id: "s2", status: "running", result: null, completed_at: null }]}
        running={false}
        onStart={vi.fn()}
        onOpenReport={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Analiz sürüyor…");
    expect(screen.queryByRole("button", { name: "Yeniden analiz et" })).not.toBeInTheDocument();
  });
});
