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

vi.mock("@/components/ai/DashboardAiCard", () => ({
  DashboardAiCard: () => <section aria-label="CaseBridge AI kartı" />,
}));

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

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
  by_status: [
    { status: "devam_eden", total: 7 },
    { status: "kapali", total: 3 },
  ],
};

beforeEach(() => {
  resetNav();
  setUrl("/dashboard");
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

  it("shows the Bu hafta badge only for hearings within the next 7 days, not past ones", async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([
      { id: "c-past", case_name: "Geçmiş Duruşma Davası", court: null, next_hearing_date: "2000-01-01", status: "durusma_bekleyen" },
      { id: "c-soon", case_name: "Yakın Duruşma Davası", court: null, next_hearing_date: soonIso, status: "durusma_bekleyen" },
    ]);

    render(<DashboardView />);

    await screen.findByText("Yakın Duruşma Davası");
    expect(screen.getAllByText("Bu hafta")).toHaveLength(1);
    const pastRow = screen.getByText("Geçmiş Duruşma Davası").closest("tr")!;
    expect(pastRow).not.toHaveTextContent("Bu hafta");
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

  it("fetches upcoming hearings with the 30-day window", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);
    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ hearing_within_days: 30 }));
  });

  it("links stat cards to analytics-consistent filtered lists", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: /Aktif Davalar/ })).toHaveAttribute("href", "/davalar?durum=aktif&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Toplam Davalar/ })).toHaveAttribute("href", "/davalar?arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kazanılan Davalar/ })).toHaveAttribute("href", "/davalar?sonuc=kazanilan&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kaybedilen Davalar/ })).toHaveAttribute("href", "/davalar?sonuc=kaybedilen&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kazanma Oranı/ })).toHaveAttribute("href", "/analitik");
  });

  it("gives every chart mark a legend link", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "İş Hukuku · 20" })).toHaveAttribute("href", "/davalar?kategori=is_hukuku&arsiv=dahil");
    expect(screen.getByRole("link", { name: "Devam Eden · 7" })).toHaveAttribute("href", "/davalar?durum=devam_eden&arsiv=dahil");
    expect(screen.getByRole("list", { name: "Dava dağılımı kategorileri" })).toBeInTheDocument();
  });

  it("opens the preview from hearings and activity", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([
      { id: "c1", case_name: "Ticari Kira Uyarlama Davası", court: null, next_hearing_date: "2999-01-01", status: "durusma_bekleyen" },
    ]);
    getRecentActivity.mockResolvedValue([
      { id: "e1", case_id: "c2", case_name: "Sözleşmenin Feshi Davası", title: "Dava açıldı", event_type: "filing", event_date: "2026-01-12", created_at: "2026-01-12" },
    ]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/dashboard?onizle=c1");
    expect(screen.getByRole("link", { name: /Dava açıldı/ })).toHaveAttribute("href", "/dashboard?onizle=c2&odak=olay%3Ae1");
    expect(screen.getByRole("link", { name: "Tümü →" })).toHaveAttribute("href", "/davalar?durusma=yaklasan");
    expect(screen.getByText("—")).toBeInTheDocument(); // missing court
  });

  it("places the CaseBridge AI card on the dashboard", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);
    expect(await screen.findByRole("region", { name: "CaseBridge AI kartı" })).toBeInTheDocument();
  });
});
