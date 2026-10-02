import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getMe = vi.fn();
const listUsers = vi.fn();
const getAiStatus = vi.fn();
const getNotificationStatus = vi.fn();
const sendTestEmail = vi.fn();

vi.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  listUsers: (...args: unknown[]) => listUsers(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
  getNotificationStatus: (...args: unknown[]) => getNotificationStatus(...args),
  sendTestEmail: (...args: unknown[]) => sendTestEmail(...args),
}));

import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/apiError";

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
  getNotificationStatus.mockReset();
  sendTestEmail.mockReset();
  getNotificationStatus.mockResolvedValue({ email_backend: "smtp", reminders_enabled: true, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
});

describe("SettingsView", () => {
  it("shows the firm's user list and AI status for an admin", async () => {
    getMe.mockResolvedValue(adminUser);
    listUsers.mockResolvedValue([adminUser, lawyerUser]);

    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText("Avukat Kullanici")).toBeInTheDocument());
    expect(screen.getByText(/mock/i)).toBeInTheDocument();
  });

  it("hides user management for a non-admin user", async () => {
    getMe.mockResolvedValue(lawyerUser);
    listUsers.mockResolvedValue([adminUser, lawyerUser]);

    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText(/sadece yöneticiler/i)).toBeInTheDocument());
    expect(screen.queryByText("Avukat Kullanici")).not.toBeInTheDocument();
  });

  it("shows the notification settings and sends a test e-mail", async () => {
    getMe.mockResolvedValue(lawyerUser);
    listUsers.mockResolvedValue([lawyerUser]);
    sendTestEmail.mockResolvedValue({ sent: true, backend: "smtp" });

    render(<SettingsView />);

    const section = await screen.findByRole("region", { name: "Bildirimler" });
    expect(section).toHaveTextContent("E-posta yöntemiSMTP");
    expect(section).toHaveTextContent("Açık — her gün 09:00'dan sonra (Europe/Istanbul)");
    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));

    expect(await screen.findByText("Test e-postası admin@demo.casebridge.dev adresine gönderildi.")).toBeInTheDocument();
    expect(sendTestEmail).toHaveBeenCalledTimes(1);
  });

  it("explains console mode and shows SMTP errors", async () => {
    getMe.mockResolvedValue(lawyerUser);
    listUsers.mockResolvedValue([lawyerUser]);
    getNotificationStatus.mockResolvedValue({ email_backend: "console", reminders_enabled: false, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
    sendTestEmail.mockResolvedValueOnce({ sent: true, backend: "console" });
    sendTestEmail.mockRejectedValueOnce(new ApiError("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.", 502));

    render(<SettingsView />);

    const section = await screen.findByRole("region", { name: "Bildirimler" });
    expect(section).toHaveTextContent("Konsol (yalnızca sunucu logu)");
    expect(section).toHaveTextContent("Kapalı");
    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
    expect(await screen.findByText("Test e-postası sunucu loguna yazıldı (konsol modu).")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.");
  });
});
