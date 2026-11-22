import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/api", () => ({
  getAiConnectivity: vi.fn(() => new Promise(() => {})),
}));

import { AI_NAVIGATION } from "@/lib/aiNavigation";
import { Sidebar } from "@/components/Sidebar";

beforeEach(() => {
  pathname = "/dashboard";
});

describe("Sidebar", () => {
  it("keeps scoped accounts inside their own workspace", () => {
    render(<Sidebar role="lawyer" restricted />);
    expect(screen.getByRole("link", { name: "Çalışma Alanım" })).toHaveAttribute("href", "/calisma-alanim");
    expect(screen.queryByRole("group", {name:"CaseBridge AI"})).not.toBeInTheDocument();
    for (const label of ["Davalar", "Ayarlar", "Büro Yönetimi", "Dosya Analizi"]) expect(screen.queryByRole("link", {name:label})).not.toBeInTheDocument();
  });
  it("renders the main navigation without the old Simülasyonlar item", () => {
    render(<Sidebar />);
    for (const label of ["Genel Bakış", "Davalar", "Takvim", "Görevler", "Analitik", "Raporlar", "Ayarlar"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    for (const label of ["Belgeler", "Emsal Kararlar"]) expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByText("Simülasyonlar")).not.toBeInTheDocument();
  });

  it("shows every authorized AI tool in the restored expanded blue panel", () => {
    render(<Sidebar role="admin" />);
    const group=screen.getByRole("group", {name:"CaseBridge AI"});
    expect(within(group).getAllByRole("link")).toHaveLength(9);
    for(const item of AI_NAVIGATION) expect(within(group).getByRole("link",{name:item.label})).toHaveAttribute("href",item.href);
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    expect(group.querySelector("details")).toBeNull();
    expect(group.className).toContain("bg-navy-950");
    expect(group.querySelector(".bg-ai-glow")).not.toBeNull();
    expect(group.className).not.toMatch(/ring-\d/);
  });

  it("marks the current route as active", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Genel Bakış" })).toHaveAttribute("aria-current", "page");
  });

  it.each(["/ai", "/ai/sohbet", "/ai/durusma/oturum/x1", "/ai/olasilik"])("marks one matching AI tool on %s", path => {
    pathname = path; render(<Sidebar />);
    const group=screen.getByRole("group", {name:"CaseBridge AI"});
    const active=group.querySelectorAll('a[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute("href",path.startsWith("/ai/durusma/")?"/ai/durusma":path);
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
