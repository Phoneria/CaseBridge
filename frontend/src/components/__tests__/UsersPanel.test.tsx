import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listManagedUsers: vi.fn(),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  resendUserInvite: vi.fn(),
  sendUserPasswordReset: vi.fn(),
  getUserWorkload: vi.fn(),
  deactivateUser: vi.fn(),
  activateUser: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  listManagedUsers: (...a: unknown[]) => api.listManagedUsers(...a),
  createManagedUser: (...a: unknown[]) => api.createManagedUser(...a),
  updateManagedUser: (...a: unknown[]) => api.updateManagedUser(...a),
  resendUserInvite: (...a: unknown[]) => api.resendUserInvite(...a),
  sendUserPasswordReset: (...a: unknown[]) => api.sendUserPasswordReset(...a),
  getUserWorkload: (...a: unknown[]) => api.getUserWorkload(...a),
  deactivateUser: (...a: unknown[]) => api.deactivateUser(...a),
  activateUser: (...a: unknown[]) => api.activateUser(...a),
}));

import { ApiError } from "@/lib/apiError";
import { UsersPanel } from "@/components/users/UsersPanel";
import type { AppUser, ManagedUser } from "@/types";

function managed(id: string, name: string, over: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id, email: `${id}@firma.test`, full_name: name, department: null, role: "lawyer", is_active: true,
    status: "active", invited_at: null, password_set_at: "2026-10-01T09:00:00", created_at: "2026-10-01T09:00:00", ...over,
  };
}

const ME: AppUser = { id: "a1", email: "a1@firma.test", full_name: "Ayşe Demir", department: null, gender: null, role: "admin", law_firm_id: "f1", is_active: true };
const ADMIN = managed("a1", "Ayşe Demir", { role: "admin", department: "Yönetim" });
const LAWYER = managed("l1", "Mehmet Kaya");
const OTHER = managed("l2", "Zeynep Çelik");
const PENDING = managed("p1", "Davet Bekleyen", { status: "pending", password_set_at: null });
const INACTIVE = managed("i1", "Pasif Kişi", { status: "inactive", is_active: false });

async function openMenu(name: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: `İşlemler, ${name}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listManagedUsers.mockResolvedValue([ADMIN, LAWYER, OTHER, PENDING, INACTIVE]);
});

describe("UsersPanel", () => {
  it("lists the firm's users with role and status labels", async () => {
    render(<UsersPanel currentUser={ME} />);

    const table = await screen.findByRole("table");
    for (const header of ["Ad", "E-posta", "Departman", "Rol", "Durum"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const pendingRow = within(table).getByText("Davet Bekleyen").closest("tr")!;
    expect(pendingRow).toHaveTextContent("Davet bekliyor");
    expect(within(table).getByText("Pasif Kişi").closest("tr")).toHaveTextContent("Pasif");
    expect(within(table).getByText("Mehmet Kaya").closest("tr")).toHaveTextContent("Aktif");
    expect(within(table).getByText("Ayşe Demir").closest("tr")).toHaveTextContent("Yönetici");
  });

  it("offers only the actions that fit each status, and none that hurt the admin's own row", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Ayşe Demir" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Şifre sıfırlama bağlantısı gönder"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Davet Bekleyen" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Daveti yeniden gönder", "Pasifleştir"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Pasif Kişi" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Aktifleştir"]);
  });

  it("invites a new user and shows the notice", async () => {
    api.createManagedUser.mockResolvedValue({ ...managed("n1", "Yeni Kişi"), status: "pending", email_sent: true });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    const dialog = screen.getByRole("dialog", { name: "Kullanıcı ekle" });
    await userEvent.type(within(dialog).getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(within(dialog).getByLabelText("E-posta *"), "yeni@firma.test");
    await userEvent.type(within(dialog).getByLabelText("Departman"), "Ceza");
    await userEvent.selectOptions(within(dialog).getByLabelText("Rol *"), "admin");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(api.createManagedUser).toHaveBeenCalledWith({ full_name: "Yeni Kişi", email: "yeni@firma.test", department: "Ceza", role: "admin" });
    expect(await screen.findByRole("status")).toHaveTextContent("Davet gönderildi.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Yeni Kişi")).toBeInTheDocument();
  });

  it("warns when the invite e-mail could not be sent", async () => {
    api.createManagedUser.mockResolvedValue({ ...managed("n1", "Yeni Kişi"), status: "pending", email_sent: false });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(screen.getByLabelText("E-posta *"), "yeni@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.");
  });

  it("shows the server's Turkish message, or a Turkish fallback, when saving fails", async () => {
    api.createManagedUser.mockRejectedValueOnce(new ApiError("Bu e-posta adresi zaten kayıtlı.", 409));
    api.createManagedUser.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(screen.getByLabelText("E-posta *"), "mehmet@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu e-posta adresi zaten kayıtlı.");

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Kullanıcı kaydedilemedi. Lütfen tekrar deneyin."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  });

  it("requires a name and a valid e-mail before calling the API", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ad soyad boş olamaz.");
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("E-posta adresi gerekli.");
    await userEvent.type(screen.getByLabelText("E-posta *"), "yanlis-adres");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Geçerli bir e-posta adresi girin.");
    expect(api.createManagedUser).not.toHaveBeenCalled();
  });

  it("edits a user and sends only the changed fields; the admin's own role is not editable", async () => {
    api.updateManagedUser.mockResolvedValue({ ...LAWYER, department: "Ticaret" });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Düzenle");
    await userEvent.type(screen.getByLabelText("Departman"), "Ticaret");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(api.updateManagedUser).toHaveBeenCalledWith("l1", { department: "Ticaret" });
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı güncellendi.");

    await openMenu("Ayşe Demir", "Düzenle");
    expect(screen.queryByLabelText("Rol *")).not.toBeInTheDocument();
    expect(screen.getByText("Rol: Yönetici")).toBeInTheDocument();
  });

  it("resends an invite, sends a password reset link and reactivates a user", async () => {
    api.resendUserInvite.mockResolvedValue({ ...PENDING, email_sent: true });
    api.sendUserPasswordReset.mockResolvedValue({ email_sent: true });
    api.activateUser.mockResolvedValue({ ...INACTIVE, status: "active", is_active: true });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Davet Bekleyen", "Daveti yeniden gönder");
    expect(await screen.findByRole("status")).toHaveTextContent("Davet gönderildi.");
    expect(api.resendUserInvite).toHaveBeenCalledWith("p1");

    await openMenu("Mehmet Kaya", "Şifre sıfırlama bağlantısı gönder");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sıfırlama bağlantısı gönderildi."));
    expect(api.sendUserPasswordReset).toHaveBeenCalledWith("l1");

    await openMenu("Pasif Kişi", "Aktifleştir");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Kullanıcı aktifleştirildi."));
    expect(screen.getByText("Pasif Kişi").closest("tr")).toHaveTextContent("Aktif");
  });

  it("shows the server's message when an action fails", async () => {
    api.activateUser.mockRejectedValue(new ApiError("Kullanıcı zaten aktif.", 409));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Pasif Kişi", "Aktifleştir");
    expect(await screen.findByRole("alert")).toHaveTextContent("Kullanıcı zaten aktif.");
  });

  it("deactivates a user without work after a plain confirmation", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 0 });
    api.deactivateUser.mockResolvedValue({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 0, tasks: 0, precedents: 0, events: 0 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Devredilecek avukat")).not.toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Pasifleştir" }));

    expect(api.deactivateUser).toHaveBeenCalledWith("l1", undefined);
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı pasifleştirildi.");
    expect(screen.getByText("Mehmet Kaya").closest("tr")).toHaveTextContent("Pasif");
  });

  it("counts upcoming calendar events as work that needs a receiving lawyer", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 3 });
    api.deactivateUser.mockResolvedValue({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 0, tasks: 0, precedents: 0, events: 3 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("3 yaklaşan takvim etkinliği")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Devredilecek avukatı seçin.");

    await userEvent.selectOptions(within(dialog).getByLabelText("Devredilecek avukat"), "l2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(api.deactivateUser).toHaveBeenCalledWith("l1", "l2");
  });

  it("requires a receiving lawyer when the user has work, and lists only eligible lawyers", async () => {
    api.getUserWorkload.mockResolvedValue({
      open_cases: [{ id: "c1", case_number: "2026/10", case_name: "Kaya - Demir" }],
      pending_tasks: [{ id: "t1", title: "Dilekçe hazırla", case_name: "Kaya - Demir" }],
      precedents_reviewing: 2,
      upcoming_events: 0,
    });
    api.deactivateUser.mockResolvedValue({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 1, tasks: 1, precedents: 2, events: 0 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("2026/10 — Kaya - Demir")).toBeInTheDocument();
    expect(within(dialog).getByText("Dilekçe hazırla — Kaya - Demir")).toBeInTheDocument();
    expect(within(dialog).getByText("İncelediği emsaller: 2")).toBeInTheDocument();

    const select = within(dialog).getByLabelText("Devredilecek avukat");
    const options = within(select).getAllByRole("option").map((el) => el.textContent);
    expect(options).toEqual(["Avukat seçin", "Zeynep Çelik"]);

    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Devredilecek avukatı seçin.");
    expect(api.deactivateUser).not.toHaveBeenCalled();

    await userEvent.selectOptions(select, "l2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(api.deactivateUser).toHaveBeenCalledWith("l1", "l2");
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı pasifleştirildi.");
  });

  it("does not send the same request twice while one is in flight", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 0 });
    let finish: (value: unknown) => void = () => undefined;
    api.deactivateUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const button = await within(await screen.findByRole("dialog")).findByRole("button", { name: "Pasifleştir" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Pasifleştiriliyor..." }));
    expect(api.deactivateUser).toHaveBeenCalledTimes(1);

    finish({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 0, tasks: 0, precedents: 0, events: 0 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a Turkish message when the list or the workload cannot be loaded", async () => {
    api.getUserWorkload.mockRejectedValue(new Error("boom"));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    expect(await screen.findByRole("alert")).toHaveTextContent("İş yükü yüklenemedi. Lütfen tekrar deneyin.");
  });

  it("closes a dialog with Escape", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the row's İşlemler button when a row-opened dialog is dismissed", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 0 });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Düzenle");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByRole("button", { name: "İşlemler, Mehmet Kaya" })).toHaveFocus();

    await openMenu("Zeynep Çelik", "Pasifleştir");
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByRole("button", { name: "İşlemler, Zeynep Çelik" })).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Kaydet" });
    const name = within(dialog).getByLabelText("Ad soyad *");
    save.focus();
    await userEvent.tab();
    expect(name).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("ignores Escape while a save is in flight", async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.createManagedUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(screen.getByLabelText("E-posta *"), "yeni@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    finish({ ...managed("n1", "Yeni Kişi"), status: "pending", email_sent: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a Turkish message when the user list cannot be loaded", async () => {
    api.listManagedUsers.mockRejectedValue(new Error("boom"));
    render(<UsersPanel currentUser={ME} />);
    expect(await screen.findByText("Kullanıcılar yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("lets the admin pick a receiving lawyer when work appeared after the workload loaded empty", async () => {
    api.getUserWorkload.mockResolvedValueOnce({ open_cases: [], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 0 });
    api.getUserWorkload.mockResolvedValueOnce({ open_cases: [{ id: "c1", case_number: "2026/10", case_name: "Kaya - Demir" }], pending_tasks: [], precedents_reviewing: 0, upcoming_events: 0 });
    api.deactivateUser.mockRejectedValueOnce(new ApiError("Açık davaları ve görevleri devretmek için bir avukat seçin.", 422));
    api.deactivateUser.mockResolvedValueOnce({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 1, tasks: 0, precedents: 0, events: 0 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Pasifleştir" }));
    expect(await within(dialog).findByLabelText("Devredilecek avukat")).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Açık davaları ve görevleri devretmek için bir avukat seçin.");

    await userEvent.selectOptions(within(dialog).getByLabelText("Devredilecek avukat"), "l2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(api.deactivateUser).toHaveBeenLastCalledWith("l1", "l2");
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı pasifleştirildi.");
  });

  it("marks row menu items aria-disabled while an action is in flight", async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.activateUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Pasif Kişi", "Aktifleştir");
    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Mehmet Kaya" }));
    for (const item of screen.getAllByRole("menuitem")) expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("menuitem", { name: "Şifre sıfırlama bağlantısı gönder" }));
    expect(api.sendUserPasswordReset).not.toHaveBeenCalled();

    finish({ ...INACTIVE, status: "active", is_active: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Kullanıcı aktifleştirildi."));
  });

  it("clears the notice when a dialog opens", async () => {
    api.activateUser.mockResolvedValue({ ...INACTIVE, status: "active", is_active: true });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Pasif Kişi", "Aktifleştir");
    expect(await screen.findByRole("status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
