import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getAnalyticsOverview = vi.fn();
const getCases = vi.fn();

vi.mock("@/lib/api", () => ({
  getAnalyticsOverview: (...args: unknown[]) => getAnalyticsOverview(...args),
  getCases: (...args: unknown[]) => getCases(...args),
}));

import { AnalyticsView } from "@/components/AnalyticsView";

beforeEach(() => {
  resetNav();
  setUrl("/analitik");
  getAnalyticsOverview.mockReset();
  getCases.mockReset();
  getCases.mockResolvedValue([]);
});

describe("AnalyticsView", () => {
  it("renders overview metrics once loaded", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 108,
      active_cases: 22,
      won_cases: 60,
      lost_cases: 26,
      win_rate: 69.77,
      average_case_duration_days: 145.2,
      by_category: [{ case_type: "is_hukuku", total: 40, won: 25, lost: 10, win_rate: 71.43 }],
      by_status: [],
    });

    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByText("108")).toBeInTheDocument());
    expect(screen.getByText("%69.77")).toBeInTheDocument();
  });

  it("renders zeros (not an error) for an empty dataset", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 0,
      active_cases: 0,
      won_cases: 0,
      lost_cases: 0,
      win_rate: 0,
      average_case_duration_days: 0,
      by_category: [],
      by_status: [],
    });

    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getAllByText("0").length).toBeGreaterThan(0));
    expect(screen.queryByText(/veriler yüklenemedi/i)).not.toBeInTheDocument();
  });

  it("shows an error state when analytics fail to load", async () => {
    getAnalyticsOverview.mockRejectedValue(new Error("boom"));
    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByText(/veriler yüklenemedi/i)).toBeInTheDocument());
  });

  it("lists lost cases with links to open or preview each one", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 2,
      active_cases: 0,
      won_cases: 1,
      lost_cases: 1,
      win_rate: 50,
      average_case_duration_days: 30,
      by_category: [],
      by_status: [],
    });
    getCases.mockResolvedValue([{ id: "c-lost-1", case_name: "Kaybedilen Dava", case_number: "2025/1", outcome: "lost" }]);

    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByText("Kaybedilen Dava")).toBeInTheDocument());
    expect(getCases).toHaveBeenCalledWith({ outcome: "lost", include_archived: true });

    expect(screen.getByRole("link", { name: "Kaybedilen Dava" })).toHaveAttribute("href", "/davalar/c-lost-1");
    expect(screen.getByRole("link", { name: "Kaybedilen Dava önizle" })).toHaveAttribute("href", "/analitik?onizle=c-lost-1");
  });

  it("links cards and category bars to filtered lists", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 10, active_cases: 4, won_cases: 3, lost_cases: 2, win_rate: 60, average_case_duration_days: 90,
      by_category: [{ case_type: "icra", total: 3, won: 1, lost: 1, win_rate: 50 }],
      by_status: [],
    });
    render(<AnalyticsView />);

    expect(await screen.findByRole("link", { name: /Kaybedilen/ })).toHaveAttribute("href", "/davalar?sonuc=kaybedilen&arsiv=dahil");
    expect(screen.queryByRole("link", { name: /Ort. Dava Süresi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İcra · %50" })).toHaveAttribute("href", "/davalar?kategori=icra&arsiv=dahil");
  });
});
