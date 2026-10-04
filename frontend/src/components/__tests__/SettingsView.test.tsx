import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getMe = vi.fn();
const listUsers = vi.fn();
const getAiStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  listUsers: (...args: unknown[]) => listUsers(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
}));

import { SettingsView } from "@/components/SettingsView";

const adminUser = {
  id: "u1",
  email: "admin@demo.casebridge.dev",
  full_name: "Admin Kullanici",
  role: "admin",
  law_firm_id: "f1",
  is_active: true,
};

const lawyerUser = { ...adminUser, id: "u2", role: "lawyer", full_name: "Avukat Kullanici" };

beforeEach(() => {
  getMe.mockReset();
  listUsers.mockReset();
  getAiStatus.mockReset();
  getAiStatus.mockResolvedValue({ provider: "mock", configured: true, error: null });
});

describe("SettingsView", () => {
  it("shows the firm's user list and AI status for an admin", async () => {
    getMe.mockResolvedValue(adminUser);
    listUsers.mockResolvedValue([adminUser, lawyerUser]);

    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText("Avukat Kullanici")).toBeInTheDocument());
    expect(screen.getByText("Hizmet hazır")).toBeInTheDocument();
    expect(screen.queryByText("mock")).not.toBeInTheDocument();
  });

  it("hides user management for a non-admin user", async () => {
    getMe.mockResolvedValue(lawyerUser);
    listUsers.mockResolvedValue([adminUser, lawyerUser]);

    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText(/sadece yöneticiler/i)).toBeInTheDocument());
    expect(screen.queryByText("Avukat Kullanici")).not.toBeInTheDocument();
  });
});
