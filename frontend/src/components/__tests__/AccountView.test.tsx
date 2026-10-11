import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getMe = vi.fn();
const updateProfile = vi.fn();
const changePassword = vi.fn();
vi.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  changePassword: (...args: unknown[]) => changePassword(...args),
}));
const announce = vi.fn();
vi.mock("@/lib/userEvents", () => ({ announceUserUpdated: (...args: unknown[]) => announce(...args) }));

import { AccountView } from "@/components/AccountView";
import { ApiError } from "@/lib/apiError";
import type { AppUser } from "@/types";

const ME: AppUser = {
  id: "u1", email: "ayse@example.com", full_name: "Ayşe Demir", department: "İş Hukuku", gender: null,
  role: "lawyer", law_firm_id: "f1", is_active: true,
};

beforeEach(() => {
  for (const mock of [getMe, updateProfile, changePassword, announce]) mock.mockReset();
  getMe.mockResolvedValue(ME);
});

async function openPage() {
  const user = userEvent.setup();
  render(<AccountView />);
  await screen.findByRole("heading", { name: "Hesabım" });
  return user;
}

describe("AccountView profile", () => {
  it("shows the profile, saves the name and department and tells the shell", async () => {
    updateProfile.mockResolvedValue({ ...ME, full_name: "Ayşe Yılmaz", department: null });
    const user = await openPage();

    expect(screen.getByLabelText("Ad soyad")).toHaveValue("Ayşe Demir");
    expect(screen.getByLabelText("Departman")).toHaveValue("İş Hukuku");
    expect(screen.getByText("ayse@example.com")).toBeInTheDocument();
    expect(screen.getByText("Avukat")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Ad soyad"));
    await user.type(screen.getByLabelText("Ad soyad"), "Ayşe Yılmaz");
    await user.clear(screen.getByLabelText("Departman"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bilgileriniz güncellendi.");
    expect(updateProfile).toHaveBeenCalledWith({ full_name: "Ayşe Yılmaz", department: null });
    expect(announce).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Ayşe Yılmaz" }));
    expect(screen.getByLabelText("Ad soyad")).toHaveValue("Ayşe Yılmaz");
  });

  it("does not call the server with an empty name", async () => {
    const user = await openPage();

    await user.clear(screen.getByLabelText("Ad soyad"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ad soyad boş olamaz.");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows only ApiError messages, otherwise a Turkish fallback", async () => {
    updateProfile.mockRejectedValueOnce(new ApiError("Ad soyad 1-255 karakter olmalı.", 422));
    const user = await openPage();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ad soyad 1-255 karakter olmalı.");

    updateProfile.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bilgileriniz güncellenemedi. Lütfen tekrar deneyin."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  });

  it("shows an error state when the profile cannot be loaded", async () => {
    getMe.mockRejectedValue(new Error("down"));
    render(<AccountView />);

    expect(await screen.findByText("Hesap bilgileri yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });
});

describe("AccountView password", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, again: string) {
    await user.type(screen.getByLabelText("Mevcut şifre"), current);
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), next);
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), again);
    await user.click(screen.getByRole("button", { name: "Şifreyi değiştir" }));
  }

  it("changes the password, confirms and clears the fields", async () => {
    changePassword.mockResolvedValue({ access_token: "new" });
    const user = await openPage();

    await fill(user, "eski-sifre-12", "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByText("Şifreniz değiştirildi.")).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith("eski-sifre-12", "yeni-guclu-sifre");
    expect(screen.getByLabelText("Mevcut şifre")).toHaveValue("");
    expect(screen.getByLabelText("Yeni şifre", { exact: true })).toHaveValue("");
  });

  it("shows the server's message for a wrong current password and keeps the entries", async () => {
    changePassword.mockRejectedValue(new ApiError("Mevcut şifre hatalı.", 400));
    const user = await openPage();

    await fill(user, "yanlis-sifre-1", "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent("Mevcut şifre hatalı.");
    expect(screen.getByLabelText("Mevcut şifre")).toHaveValue("yanlis-sifre-1");
  });

  it("checks the new password locally before calling the server", async () => {
    const user = await openPage();

    await fill(user, "eski-sifre-12", "kisa", "kisa");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), "yeni-guclu-sifre");
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), "baska-guclu-sifre");
    await user.click(screen.getByRole("button", { name: "Şifreyi değiştir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Şifreler eşleşmiyor.");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("ignores a second submit while the first is running and keeps the button focusable", async () => {
    let finish: (value: { access_token: string }) => void = () => undefined;
    changePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = await openPage();

    await fill(user, "eski-sifre-12", "yeni-guclu-sifre", "yeni-guclu-sifre");
    const busy = await screen.findByRole("button", { name: "Kaydediliyor..."  });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(changePassword).toHaveBeenCalledTimes(1);

    finish({ access_token: "new" });
    expect(await screen.findByText("Şifreniz değiştirildi.")).toBeInTheDocument();
  });
});
