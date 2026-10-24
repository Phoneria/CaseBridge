import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listPlatformFirms: vi.fn(),
  createPlatformFirm: vi.fn(),
  addPlatformFirmAdmin: vi.fn(),
  resendPlatformAdminInvite: vi.fn(),
  suspendPlatformFirm: vi.fn(),
  activatePlatformFirm: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  listPlatformFirms: (...a: unknown[]) => api.listPlatformFirms(...a),
  createPlatformFirm: (...a: unknown[]) => api.createPlatformFirm(...a),
  addPlatformFirmAdmin: (...a: unknown[]) => api.addPlatformFirmAdmin(...a),
  resendPlatformAdminInvite: (...a: unknown[]) => api.resendPlatformAdminInvite(...a),
  suspendPlatformFirm: (...a: unknown[]) => api.suspendPlatformFirm(...a),
  activatePlatformFirm: (...a: unknown[]) => api.activatePlatformFirm(...a),
}));

import { ApiError } from "@/lib/apiError";
import { PlatformView } from "@/components/platform/PlatformView";
import type { PlatformAdmin, PlatformFirm } from "@/types";

function admin(id: string, name: string, over: Partial<PlatformAdmin> = {}): PlatformAdmin {
  return { id, full_name: name, email: `${id}@buro.test`, status: "active", invited_at: null, ...over };
}

function firm(id: string, name: string, over: Partial<PlatformFirm> = {}): PlatformFirm {
  return {
    id, name, created_at: "2026-10-01T09:00:00", is_active: true, suspended_at: null, active_user_count: 3,
    admins: [admin(`${id}-a`, `${name} Yöneticisi`)], ...over,
  };
}

const DEMIR = firm("f1", "Demir Hukuk", {
  admins: [admin("a1", "Ayşe Demir"), admin("p1", "Bekleyen Kişi", { status: "pending" })],
});
const KAYA = firm("f2", "Kaya Hukuk");

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listPlatformFirms.mockResolvedValue([DEMIR, KAYA]);
});

describe("PlatformView", () => {
  it("lists the firms with status, user count and pending invites", async () => {
    render(<PlatformView />);

    const table = await screen.findByRole("table");
    for (const header of ["Büro", "Durum", "Aktif kullanıcı", "Yöneticiler", "Oluşturulma"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const row = within(table).getByRole("button", { name: "Demir Hukuk" }).closest("tr")!;
    expect(row).toHaveTextContent("Aktif");
    expect(row).toHaveTextContent("3");
    expect(row).toHaveTextContent("Bekleyen Kişi");
    expect(row).toHaveTextContent("Davet bekliyor");
  });

  it("reads the backend's offset-less timestamps as UTC", async () => {
    const zone = process.env.TZ;
    process.env.TZ = "Asia/Tokyo"; // 22:30 UTC is already the next day here
    try {
      api.listPlatformFirms.mockResolvedValue([{ ...DEMIR, created_at: "2026-10-01T22:30:00" }]);
      render(<PlatformView />);

      const row = (await screen.findByRole("button", { name: "Demir Hukuk" })).closest("tr")!;
      expect(row).toHaveTextContent("2.10.2026");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  it("shows an empty-state hint when there are no firms", async () => {
    api.listPlatformFirms.mockResolvedValue([]);
    render(<PlatformView />);
    expect(await screen.findByText(/Henüz büro yok/)).toBeInTheDocument();
  });

  it("creates a firm with its first admin", async () => {
    const created = firm("f3", "Yıldız Hukuk", { active_user_count: 0, admins: [admin("y1", "Selin Yıldız", { status: "pending" })] });
    api.createPlatformFirm.mockResolvedValue({ firm: created, admin: created.admins[0], email_sent: true });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Yıldız Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Selin Yıldız");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "selin@yildiz.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(api.createPlatformFirm).toHaveBeenCalledWith({
      name: "Yıldız Hukuk", admin_full_name: "Selin Yıldız", admin_email: "selin@yildiz.test",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Büro oluşturuldu, davet gönderildi.");
    expect(screen.getByRole("button", { name: "Yıldız Hukuk" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns when the invite e-mail could not be sent", async () => {
    const created = firm("f3", "Yıldız Hukuk");
    api.createPlatformFirm.mockResolvedValue({ firm: created, admin: created.admins[0], email_sent: false });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Yıldız Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Selin Yıldız");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "selin@yildiz.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet e-postası gönderilemedi");
  });

  it("keeps the form open with the server's message", async () => {
    api.createPlatformFirm.mockRejectedValue(new ApiError("Bu adla bir büro zaten var.", 409));
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Demir Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Ali Demir");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "ali@demir.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Bu adla bir büro zaten var.");
  });

  it("checks the form before sending", async () => {
    render(<PlatformView />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Büro adı boş olamaz.");
    expect(api.createPlatformFirm).not.toHaveBeenCalled();
  });

  it("re-sends a pending admin's invite from the firm panel", async () => {
    api.resendPlatformAdminInvite.mockResolvedValue({ admin: DEMIR.admins[1], email_sent: true });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Demir Hukuk" }));
    const panel = screen.getByRole("dialog", { name: "Demir Hukuk" });
    expect(within(panel).queryByRole("button", { name: "Daveti yeniden gönder, Ayşe Demir" })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Daveti yeniden gönder, Bekleyen Kişi" }));

    expect(api.resendPlatformAdminInvite).toHaveBeenCalledWith("f1", "p1");
    expect(await within(panel).findByRole("status")).toHaveTextContent("Davet gönderildi.");
  });

  it("suspends a firm after confirmation", async () => {
    api.suspendPlatformFirm.mockResolvedValue({ ...KAYA, is_active: false, suspended_at: "2026-10-23T20:00:00" });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Kaya Hukuk" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Kaya Hukuk" })).getByRole("button", { name: "Büroyu askıya al" }));
    const confirm = screen.getByRole("dialog", { name: "Büroyu askıya al" });
    expect(confirm).toHaveTextContent("Veriler silinmez");
    await userEvent.click(within(confirm).getByRole("button", { name: "Askıya al" }));

    expect(api.suspendPlatformFirm).toHaveBeenCalledWith("f2");
    const panel = await screen.findByRole("dialog", { name: "Kaya Hukuk" });
    expect(within(panel).getByRole("status")).toHaveTextContent("Büro askıya alındı.");
    expect(within(panel).getByRole("button", { name: "Büroyu aktifleştir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaya Hukuk" }).closest("tr")).toHaveTextContent("Askıda");
  });

  it("adds an admin to a suspended firm and says the invite waits", async () => {
    const suspended = { ...KAYA, is_active: false, suspended_at: "2026-10-23T20:00:00" };
    api.listPlatformFirms.mockResolvedValue([suspended]);
    api.addPlatformFirmAdmin.mockResolvedValue({ admin: admin("n1", "Yeni Yönetici", { status: "pending" }), email_sent: false });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Kaya Hukuk" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Kaya Hukuk" })).getByRole("button", { name: "Yönetici ekle" }));
    const form = screen.getByRole("dialog", { name: "Yönetici ekle — Kaya Hukuk" });
    await userEvent.type(within(form).getByLabelText("Ad soyad *"), "Yeni Yönetici");
    await userEvent.type(within(form).getByLabelText("E-posta *"), "yeni@kaya.test");
    await userEvent.click(within(form).getByRole("button", { name: "Ekle" }));

    expect(api.addPlatformFirmAdmin).toHaveBeenCalledWith("f2", { full_name: "Yeni Yönetici", email: "yeni@kaya.test" });
    const panel = await screen.findByRole("dialog", { name: "Kaya Hukuk" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("Büro askıda olduğu için davet e-postası gönderilmedi");
    expect(within(panel).getByText("Yeni Yönetici")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    api.listPlatformFirms.mockRejectedValue(new Error("network"));
    render(<PlatformView />);
    expect(await screen.findByText("Bürolar yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });
});
