import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SimulationResultCard } from "@/components/SimulationResultCard";
import type { AIAnalysisResult } from "@/types";

const result: AIAnalysisResult = {
  summary: "Dava orta düzeyde risk taşımaktadır.",
  strong_points: ["Yazılı sözleşme mevcut"],
  weak_points: ["Ödeme kanıtları eksik"],
  opposing_arguments: ["Karşı taraf fesih bildirimini reddediyor"],
  missing_information: ["Tebligat kaydı"],
  possible_scenarios: ["Kısmi kabul"],
  questions: ["Tebligat ne zaman yapıldı?"],
  recommended_actions: ["Tebligat kaydı talep edilmeli"],
  assessment: { score: 72, confidence: "medium" },
  ai_disclaimer: "Bu değerlendirme yapay zeka tarafından üretilmiş bir tahmindir.",
  requires_verification: false,
};

describe("SimulationResultCard", () => {
  it("renders the assessment as a labeled AI estimate, never a certainty claim", () => {
    render(<SimulationResultCard result={result} />);
    expect(screen.getByText("AI Değerlendirmesi: %72")).toBeInTheDocument();
    expect(screen.queryByText(/kesinlikle/i)).not.toBeInTheDocument();
  });

  it("always renders the AI disclaimer", () => {
    render(<SimulationResultCard result={result} />);
    expect(screen.getByText(result.ai_disclaimer)).toBeInTheDocument();
  });

  it("renders strong points, weak points, and recommended actions", () => {
    render(<SimulationResultCard result={result} />);
    expect(screen.getByText("Yazılı sözleşme mevcut")).toBeInTheDocument();
    expect(screen.getByText("Ödeme kanıtları eksik")).toBeInTheDocument();
    expect(screen.getByText("Tebligat kaydı talep edilmeli")).toBeInTheDocument();
  });
});
