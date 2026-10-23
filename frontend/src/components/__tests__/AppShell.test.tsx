import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getMe = vi.fn();
vi.mock("@/lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getAiConnectivity: vi.fn(() => new Promise(() => {})),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
vi.mock("@/components/WorkspaceHeader", () => ({ WorkspaceHeader: () => null }));
vi.mock("@/components/CaseQuickView", () => ({ CaseQuickView: () => null }));

import { AppShell } from "@/components/AppShell";
import { nav, resetNav, setUrl } from "@/test/navigation";

const LAWYER = { id: "l1", role: "lawyer", is_platform_admin: false };
const PLATFORM = { id: "p1", role: "admin", is_platform_admin: true };

beforeEach(() => {
  resetNav();
  getMe.mockReset();
  window.localStorage.setItem("casebridge_token", "t");
});

describe("AppShell", () => {
  it("sends a platform admin from a firm page to the platform panel", async () => {
    setUrl("/dashboard");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell><p>firma sayfası</p></AppShell>);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/platform"));
    expect(screen.queryByText("firma sayfası")).not.toBeInTheDocument();
  });

  it("lets a platform admin open the account page", async () => {
    setUrl("/hesabim");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell><p>hesap</p></AppShell>);

    expect(await screen.findByText("hesap")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends anyone else away from the platform panel", async () => {
    setUrl("/platform");
    getMe.mockResolvedValue(LAWYER);
    render(<AppShell platform><p>panel</p></AppShell>);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });

  it("shows the platform panel to a platform admin", async () => {
    setUrl("/platform");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell platform><p>panel</p></AppShell>);

    expect(await screen.findByText("panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Büro Yönetimi/ })).toBeInTheDocument();
  });
});
