import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getPrecedents = vi.fn();
const getPrecedentDocuments = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

vi.mock("@/lib/api", () => ({
  getPrecedents: (...args: unknown[]) => getPrecedents(...args),
  getPrecedentDocuments: (...args: unknown[]) => getPrecedentDocuments(...args),
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
  it("shows the first precedent and its full text directly on the page", async () => {
    render(<PrecedentsView />);
    expect(await screen.findByRole("heading", { level: 2, name: "Puantaj kararı" })).toBeInTheDocument();
    expect(screen.getByText(/kazanma oranına dahil değildir/i)).toBeInTheDocument();
    expect(await screen.findByText("Yazılı kayıtlar değerlendirildi.")).toBeInTheDocument();
    expect(await screen.findByText("Kararın tam metni")).toBeVisible();
    expect(screen.queryByText(/karar\.txt indir/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Tam metni göster")).not.toBeInTheDocument();
    expect(getPrecedentDocuments).toHaveBeenCalledWith("p1");
  });

  it("opens a decision linked from global search", async () => {
    window.history.replaceState(null, "", "/emsaller?karar=p1");
    render(<PrecedentsView />);
    expect(await screen.findByText("Yazılı kayıtlar değerlendirildi.")).toBeInTheDocument();
    window.history.replaceState(null, "", "/emsaller");
  });

  it("updates the visible decision text when another decision is selected", async () => {
    getPrecedents.mockResolvedValue([
      { id: "p1", case_name: "Puantaj kararı", case_number: "Y9HD 2026/1", court: "Yargıtay 9. HD", case_type: "is_hukuku", opening_date: "2026-03-26", description: "İlk özet" },
      { id: "p2", case_name: "Kira kararı", case_number: "Y3HD 2026/2", court: "Yargıtay 3. HD", case_type: "kira", opening_date: "2026-03-27", description: "İkinci özet" },
    ]);
    getPrecedentDocuments.mockImplementation(async (id: string) => [{ id: `d-${id}`, filename: `${id}.txt`, extracted_text: `${id} tam karar metni` }]);
    render(<PrecedentsView />);
    expect(await screen.findByText("p1 tam karar metni")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Kira kararı/i }));
    expect(await screen.findByText("p2 tam karar metni")).toBeVisible();
    expect(screen.queryByText("p1 tam karar metni")).not.toBeInTheDocument();
  });
});
