import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { Sidebar } from "@/components/Sidebar";

describe("Sidebar", () => {
  it("renders all navigation items", () => {
    render(<Sidebar />);

    const expectedLabels = [
      "Dashboard",
      "Davalar",
      "Takvim",
      "Görevler",
      "Belgeler",
      "Simülasyonlar",
      "Analitik",
      "Raporlar",
      "Ayarlar",
    ];

    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the current route as active", () => {
    render(<Sidebar />);
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  it("renders the CaseBridge brand name", () => {
    render(<Sidebar />);
    expect(screen.getByText("CaseBridge")).toBeInTheDocument();
  });
});
