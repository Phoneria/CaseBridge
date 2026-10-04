import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getPrecedents = vi.fn();
const getPrecedentDocuments = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

vi.mock("@/lib/api", () => ({
  getPrecedents: (...args: unknown[]) => getPrecedents(...args),
  getPrecedentDocuments: (...args: unknown[]) => getPrecedentDocuments(...args),
  downloadDocument: vi.fn(),
}));

import { PrecedentsView } from "@/components/PrecedentsView";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/emsaller");
  getPrecedents.mockResolvedValue([{
    id: "p1", case_name: "Puantaj kararı", case_number: "Y9HD 2026/1", court: "Yargıtay 9. HD",
    case_type: "is_hukuku", opening_date: "2026-03-26", description: "Yazılı kayıtlar değerlendirildi.",
  }]);
  getPrecedentDocuments.mockResolvedValue([{
    id: "d1", filename: "karar.txt", extracted_text: "Kararın tam metni",
  }]);
});

describe("PrecedentsView", () => {
  it("shows precedents separately from firm cases and opens their text", async () => {
    render(<PrecedentsView />);
    expect(await screen.findByText("Puantaj kararı")).toBeInTheDocument();
    expect(screen.getByText(/kazanma oranına dahil değildir/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Puantaj kararı/i }));
    expect(await screen.findByText("Yazılı kayıtlar değerlendirildi.")).toBeInTheDocument();
    expect(await screen.findByText("karar.txt indir")).toBeInTheDocument();
    expect(getPrecedentDocuments).toHaveBeenCalledWith("p1");
  });

  it("opens a decision linked from global search", async () => {
    window.history.replaceState(null, "", "/emsaller?karar=p1");
    render(<PrecedentsView />);
    expect(await screen.findByText("Yazılı kayıtlar değerlendirildi.")).toBeInTheDocument();
    window.history.replaceState(null, "", "/emsaller");
  });
});
