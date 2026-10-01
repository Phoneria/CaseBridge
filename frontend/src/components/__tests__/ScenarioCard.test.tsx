import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScenarioCard } from "@/components/ai/ScenarioCard";
import type { CourtroomScenario } from "@/types";

const scenario = {
  id: "sc1",
  title: "Kira Uyarlama",
  category: "Ticaret",
  difficulty: "beginner",
  summary: "Özet",
  plaintiff_name: "A",
  defendant_name: "B",
  estimated_rounds: 6,
  disputed_issues: ["Konu 1"],
  learning_objectives: ["Hedef 1"],
} as unknown as CourtroomScenario;

describe("ScenarioCard", () => {
  it("exposes the details toggle state with aria-expanded", async () => {
    render(<ScenarioCard scenario={scenario} busy={false} onStart={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "Davayı incele" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Detayı gizle" })).toHaveAttribute("aria-expanded", "true");
  });
});
