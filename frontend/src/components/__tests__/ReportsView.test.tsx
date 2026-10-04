import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadReportCsv = vi.fn();
const getReportSummary = vi.fn();
const getAnalyticsOverview = vi.fn();

vi.mock("@/lib/api", () => ({
  downloadReportCsv: (...args: unknown[]) => downloadReportCsv(...args),
  getReportSummary: (...args: unknown[]) => getReportSummary(...args),
  getAnalyticsOverview: (...args: unknown[]) => getAnalyticsOverview(...args),
}));

import { ReportsView } from "@/components/ReportsView";

const summary = { total_cases: 20, upcoming_hearings_30d: 12, open_tasks: 9, win_rate: 62.5 };
const overview = {
  total_cases: 20, active_cases: 12, won_cases: 5, lost_cases: 3, win_rate: 62.5,
  average_case_duration_days: 120,
  by_status: [{ status: "devam_eden", total: 12 }, { status: "kapali", total: 8 }],
  by_category: [{ case_type: "is_hukuku", total: 9, won: 3, lost: 2, win_rate: 60 }, { case_type: "kira", total: 6, won: 2, lost: 1, win_rate: 66.7 }],
  by_lawyer: [],
};

beforeEach(() => {
  downloadReportCsv.mockReset();
  getReportSummary.mockReset();
  getAnalyticsOverview.mockReset();
  getReportSummary.mockResolvedValue(summary);
  getAnalyticsOverview.mockResolvedValue(overview);
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
    expect(screen.getAllByText("Canlı veri")).toHaveLength(5);
    expect(screen.getByRole("region", { name: "Hızlı rapor özeti" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Dava durum dağılımı: Devam Eden 12, Kapalı 8/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İş Hukuku: 9 dava" })).toHaveAttribute("href", "/davalar?kategori=is_hukuku&arsiv=dahil");
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

  it("keeps CSV reports available if the chart data fails", async () => {
    getAnalyticsOverview.mockRejectedValue(new Error("boom"));
    render(<ReportsView />);
    expect(await screen.findByText(/Grafik özeti şu anda yüklenemedi/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^CSV Olarak İndir$/ })).toHaveLength(4);
  });
});
