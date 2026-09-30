import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadReportCsv = vi.fn();
const getReportSummary = vi.fn();

vi.mock("@/lib/api", () => ({
  downloadReportCsv: (...args: unknown[]) => downloadReportCsv(...args),
  getReportSummary: (...args: unknown[]) => getReportSummary(...args),
}));

import { ReportsView } from "@/components/ReportsView";

const summary = { total_cases: 20, upcoming_hearings_30d: 12, open_tasks: 9, win_rate: 62.5 };

beforeEach(() => {
  downloadReportCsv.mockReset();
  getReportSummary.mockReset();
  getReportSummary.mockResolvedValue(summary);
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("ReportsView", () => {
  it("shows live numbers as links to the matching lists", async () => {
    render(<ReportsView />);

    expect(await screen.findByRole("link", { name: "20 dava kaydı" })).toHaveAttribute("href", "/davalar?arsiv=dahil");
    expect(screen.getByRole("link", { name: "12 yaklaşan duruşma (30 gün)" })).toHaveAttribute("href", "/davalar?durusma=yaklasan");
    expect(screen.getByRole("link", { name: "9 açık görev" })).toHaveAttribute("href", "/gorevler?durum=acik");
    expect(screen.getByRole("link", { name: "%62,5 kazanma oranı" })).toHaveAttribute("href", "/analitik");
    expect(screen.queryByText(/bugün güncellendi/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Canlı veri")).toHaveLength(4);
  });

  it("downloads each report as a real CSV", async () => {
    downloadReportCsv.mockResolvedValue(new Blob(["a,b\n1,2"], { type: "text/csv" }));
    render(<ReportsView />);

    const buttons = await screen.findAllByRole("button", { name: /^CSV Olarak İndir$/ });
    expect(buttons).toHaveLength(4);
    await userEvent.click(buttons[1]);

    await waitFor(() => expect(downloadReportCsv).toHaveBeenCalledWith("hearings"));
  });

  it("shows an error message when the download fails", async () => {
    downloadReportCsv.mockRejectedValue(new Error("boom"));
    render(<ReportsView />);

    await userEvent.click((await screen.findAllByRole("button", { name: /^CSV Olarak İndir$/ }))[0]);

    await waitFor(() => expect(screen.getByText(/rapor indirilemedi/i)).toBeInTheDocument());
  });

  it("shows an em dash when the summary cannot be loaded", async () => {
    getReportSummary.mockRejectedValue(new Error("boom"));
    render(<ReportsView />);

    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(4));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Canlı veri")).not.toBeInTheDocument();
  });
});
