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
  it("keeps scoped accounts inside their own workspace", () => {
    render(<Sidebar role="lawyer" restricted />);
    expect(screen.getByRole("link", { name: "Çalışma Alanım" })).toHaveAttribute("href", "/calisma-alanim");
    for (const label of ["Davalar", "Ayarlar", "Büro Yönetimi", "Dosya Analizi"]) expect(screen.queryByRole("link", {name:label})).not.toBeInTheDocument();
  });
  it("renders the main navigation without the old Simülasyonlar item", () => {
    render(<Sidebar />);
    for (const label of ["Genel Bakış", "Davalar", "Takvim", "Görevler", "Belgeler", "Analitik", "Raporlar", "Ayarlar"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Simülasyonlar")).not.toBeInTheDocument();
  });

  it("keeps AI entry points exclusively in the header", () => {
    render(<Sidebar />);
    expect(screen.queryByRole("group", {name:"CaseBridge AI"})).not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name:"Dosya Analizi"})).not.toBeInTheDocument();
  });

  it("marks the current route as active", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Genel Bakış" })).toHaveAttribute("aria-current", "page");
  });

  it.each(["/ai", "/ai/sohbet", "/ai/durusma/oturum/x1", "/ai/olasilik"])("does not duplicate AI links on %s", path => {
    pathname = path; render(<Sidebar />);
    expect(screen.queryByRole("group", {name:"CaseBridge AI"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name:/AI kontrol/})).not.toBeInTheDocument();
  });

  it("renders the CaseBridge brand name", () => {
    render(<Sidebar />);
    expect(screen.getByRole("img", { name: "CaseBridge" })).toBeInTheDocument();
    expect(screen.queryByText("CB")).not.toBeInTheDocument();
  });

  it("shows only the platform items to a platform admin", () => {
    pathname = "/platform";
    render(<Sidebar role="admin" platform />);

    expect(screen.getByRole("link", { name: /Büro Yönetimi/ })).toHaveAttribute("href", "/platform");
    expect(screen.getByRole("link", { name: /Hesabım/ })).toHaveAttribute("href", "/hesabim");
    expect(screen.queryByRole("link", { name: /Davalar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin Paneli/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "CaseBridge AI" })).not.toBeInTheDocument();
  });
});
