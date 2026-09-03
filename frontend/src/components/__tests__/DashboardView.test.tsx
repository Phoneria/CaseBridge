import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getAnalyticsOverview = vi.fn();
const getCases = vi.fn();
const getRecentActivity = vi.fn();

vi.mock("@/lib/api", () => ({
  getAnalyticsOverview: (...args: unknown[]) => getAnalyticsOverview(...args),
  getCases: (...args: unknown[]) => getCases(...args),
  getRecentActivity: (...args: unknown[]) => getRecentActivity(...args),
}));

import { DashboardView } from "@/components/DashboardView";

const overview = {
  total_cases: 42,
  active_cases: 10,
  won_cases: 20,
  lost_cases: 5,
  win_rate: 80,
  average_case_duration_days: 120,
  by_category: [
    { case_type: "is_hukuku", total: 20, won: 15, lost: 2, win_rate: 88.24 },
    { case_type: "kira", total: 10, won: 5, lost: 3, win_rate: 62.5 },
  ],
};

beforeEach(() => {
  getAnalyticsOverview.mockReset();
  getCases.mockReset();
  getRecentActivity.mockReset();
  getRecentActivity.mockResolvedValue([]);
});

describe("DashboardView", () => {
  it("shows a loading state before data arrives", () => {
    getAnalyticsOverview.mockReturnValue(new Promise(() => {}));
    getCases.mockReturnValue(new Promise(() => {}));

    render(<DashboardView />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
  });

  it("renders key metrics once data loads", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);

    render(<DashboardView />);

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("%80")).toBeInTheDocument();
  });

  it("shows an empty state for upcoming hearings when there are none", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);

    render(<DashboardView />);

    await waitFor(() => expect(screen.getByText(/yaklaşan duruşma bulunmuyor/i)).toBeInTheDocument());
  });

  it("renders upcoming hearings from cases with a next_hearing_date", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([
      {
        id: "c1",
        case_name: "İşçilik Alacakları Davası",
        court: "İstanbul 5. İş Mahkemesi",
        next_hearing_date: "2026-09-20",
        status: "durusma_bekleyen",
      },
    ]);

    render(<DashboardView />);

    await waitFor(() => expect(screen.getByText("İşçilik Alacakları Davası")).toBeInTheDocument());
  });

  it("shows an error state when analytics fail to load", async () => {
    getAnalyticsOverview.mockRejectedValue(new Error("network error"));
    getCases.mockResolvedValue([]);

    render(<DashboardView />);

    await waitFor(() => expect(screen.getByText(/veriler yüklenemedi/i)).toBeInTheDocument());
  });

  it("renders recent activity from real case events", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    getRecentActivity.mockResolvedValue([
      {
        id: "e1",
        case_id: "c1",
        case_name: "Sözleşmenin Feshi Davası",
        title: "Dava açıldı",
        event_type: "filing",
        event_date: "2026-01-12",
        created_at: "2026-01-12",
      },
    ]);

    render(<DashboardView />);

    await waitFor(() => expect(screen.getByText("Dava açıldı")).toBeInTheDocument());
    expect(screen.getByText(/Sözleşmenin Feshi Davası/)).toBeInTheDocument();
  });
});
