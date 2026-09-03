import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getAnalyticsOverview = vi.fn();
const getCases = vi.fn();

vi.mock("@/lib/api", () => ({
  getAnalyticsOverview: (...args: unknown[]) => getAnalyticsOverview(...args),
  getCases: (...args: unknown[]) => getCases(...args),
}));

import { AnalyticsView } from "@/components/AnalyticsView";

beforeEach(() => {
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

  it("lists lost cases with a link to open each one", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 2,
      active_cases: 0,
      won_cases: 1,
      lost_cases: 1,
      win_rate: 50,
      average_case_duration_days: 30,
      by_category: [],
    });
    getCases.mockResolvedValue([
      { id: "c-lost-1", case_name: "Kaybedilen Dava", case_number: "2025/1", outcome: "lost" },
      { id: "c-won-1", case_name: "Kazanılan Dava", case_number: "2025/2", outcome: "won" },
    ]);

    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByText("Kaybedilen Dava")).toBeInTheDocument());
    expect(screen.queryByText("Kazanılan Dava")).not.toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Kaybedilen Dava" });
    expect(link).toHaveAttribute("href", "/davalar/c-lost-1");
  });
});
