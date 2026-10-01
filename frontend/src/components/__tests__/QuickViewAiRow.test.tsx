import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listSimulations = vi.fn();
vi.mock("@/lib/api", () => ({
  listSimulations: (...args: unknown[]) => listSimulations(...args),
}));

import { QuickViewAiRow } from "@/components/ai/QuickViewAiRow";

const completed = {
  id: "s1",
  case_id: "c1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-12T10:00:00",
  completed_at: "2026-09-12T10:05:00",
  current_stage: null,
  failure_category: null,
  result: { assessment: { score: 72, confidence: "medium" }, summary: "Özet" },
};

beforeEach(() => {
  listSimulations.mockReset();
});

describe("QuickViewAiRow", () => {
  it("shows the latest AI assessment with a link to the AI tab", async () => {
    listSimulations.mockResolvedValue([completed]);
    render(<QuickViewAiRow caseId="c1" />);

    expect(await screen.findByText(/Son AI değerlendirmesi: %72/)).toBeInTheDocument();
    expect(listSimulations).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("link", { name: "Analize git" })).toHaveAttribute("href", "/davalar/c1?sekme=ai");
  });

  it("offers to start an analysis when there is none", async () => {
    listSimulations.mockResolvedValue([]);
    render(<QuickViewAiRow caseId="c1" />);

    expect(await screen.findByText("Henüz AI analizi yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analiz başlat" })).toHaveAttribute("href", "/ai/analiz?dava=c1");
  });

  it("renders nothing when the request fails", async () => {
    listSimulations.mockRejectedValue(new Error("boom"));
    const { container } = render(<QuickViewAiRow caseId="c1" />);
    await waitFor(() => expect(listSimulations).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
