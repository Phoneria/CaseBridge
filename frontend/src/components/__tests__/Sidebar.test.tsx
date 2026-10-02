import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/api", () => ({
  getAiConnectivity: vi.fn(() => new Promise(() => {})),
}));

import { Sidebar } from "@/components/Sidebar";

beforeEach(() => {
  pathname = "/dashboard";
});

describe("Sidebar", () => {
  it("renders the main navigation without the old Simülasyonlar item", () => {
    render(<Sidebar />);
    for (const label of ["Dashboard", "Davalar", "Takvim", "Görevler", "Belgeler", "Analitik", "Raporlar", "Ayarlar"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Simülasyonlar")).not.toBeInTheDocument();
  });

  it("renders the CaseBridge AI block", () => {
    render(<Sidebar />);
    expect(screen.getByRole("group", { name: "CaseBridge AI" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).toHaveAttribute("href", "/ai");
    expect(screen.getByRole("link", { name: "Dosya Analizi" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Canlı Duruşma" })).toHaveAttribute("href", "/ai/durusma");
    expect(screen.getByRole("link", { name: "Hukuk Asistanı" })).toHaveAttribute("href", "/ai/sohbet");
  });

  it("marks the current route as active", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("marks AI routes as active, including session pages", () => {
    pathname = "/ai/durusma/oturum/x1";
    const { unmount } = render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Canlı Duruşma" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).not.toHaveAttribute("aria-current");
    unmount();

    pathname = "/ai";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the chat route as active with a conversation open", () => {
    pathname = "/ai/sohbet";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Hukuk Asistanı" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the AI connection indicator", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: /AI kontrol ediliyor/ })).toBeInTheDocument();
  });

  it("renders the CaseBridge brand name", () => {
    render(<Sidebar />);
    expect(screen.getByText("CaseBridge")).toBeInTheDocument();
  });
});
