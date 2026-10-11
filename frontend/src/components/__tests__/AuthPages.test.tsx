import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const login = vi.fn();
const getMe = vi.fn();
const setToken = vi.fn();
const getAuthConfig = vi.fn();
const forgotPassword = vi.fn();
const getTokenInfo = vi.fn();
const setPassword = vi.fn();
vi.mock("@/lib/api", () => ({
  login: (...args: unknown[]) => login(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  setToken: (...args: unknown[]) => setToken(...args),
  getAuthConfig: (...args: unknown[]) => getAuthConfig(...args),
  forgotPassword: (...args: unknown[]) => forgotPassword(...args),
  getTokenInfo: (...args: unknown[]) => getTokenInfo(...args),
  setPassword: (...args: unknown[]) => setPassword(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { ApiError } from "@/lib/apiError";
import { ForgotPasswordView } from "@/components/auth/ForgotPasswordView";
import { LoginView } from "@/components/auth/LoginView";
import { SetPasswordView } from "@/components/auth/SetPasswordView";

const LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.";

beforeEach(() => {
  for (const mock of [login, getMe, setToken, getAuthConfig, forgotPassword, getTokenInfo, setPassword]) mock.mockReset();
  resetNav();
  getAuthConfig.mockResolvedValue({ demo_mode: false });
});

describe("LoginView", () => {
  it("starts with an empty form and no demo hint outside demo mode", async () => {
    render(<LoginView />);

    expect(screen.getByLabelText("E-posta")).toHaveValue("");
    expect(screen.getByLabelText("Şifre")).toHaveValue("");
    await waitFor(() => expect(getAuthConfig).toHaveBeenCalled());
    expect(screen.queryByText("Demo hesapları")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toHaveAttribute("href", "/sifremi-unuttum");
  });

  it("shows the demo accounts hint in demo mode", async () => {
    getAuthConfig.mockResolvedValue({ demo_mode: true });
    render(<LoginView />);

    expect(await screen.findByText("Demo hesapları")).toBeInTheDocument();
    expect(screen.getByText("Yönetici: admin@demo.casebridge.dev")).toBeInTheDocument();
    expect(screen.getByText("Avukat: avukat@demo.casebridge.dev")).toBeInTheDocument();
    expect(screen.getByText("Şifre: demo1234")).toBeInTheDocument();
    expect(screen.getByLabelText("E-posta")).toHaveValue("");
  });

  it("works without a hint when the config call fails", async () => {
    getAuthConfig.mockRejectedValue(new Error("down"));
    render(<LoginView />);

    await waitFor(() => expect(getAuthConfig).toHaveBeenCalled());
    expect(screen.queryByText("Demo hesapları")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giriş Yap" })).toBeInTheDocument();
  });

  it.each([
    ["admin", "/admin"],
    ["lawyer", "/dashboard"],
  ])("logs in a %s and goes to %s", async (role, destination) => {
    login.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role });
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "gizli-sifre-1");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(destination));
    expect(login).toHaveBeenCalledWith("a@example.com", "gizli-sifre-1");
    expect(setToken).toHaveBeenCalledWith("tok");
  });

  it("shows the server's Turkish message for a failed login", async () => {
    login.mockRejectedValue(new ApiError("E-posta veya şifre hatalı.", 401));
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "yanlis");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı.");
    expect(nav.push).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it("never shows a raw error message: unexpected errors get the Turkish fallback", async () => {
    login.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "x");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Giriş yapılamadı. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("keeps the button focusable while submitting (aria-disabled) and ignores a second submit", async () => {
    let finish: (value: { access_token: string }) => void = () => undefined;
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "gizli-sifre-1");
    const button = screen.getByRole("button", { name: "Giriş Yap" });
    await user.click(button);

    const busy = await screen.findByRole("button", { name: "Giriş yapılıyor..." });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    await user.click(busy);
    expect(login).toHaveBeenCalledTimes(1);

    finish({ access_token: "tok" });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("ForgotPasswordView", () => {
  it("sends the address and shows the same confirmation whatever the account", async () => {
    forgotPassword.mockResolvedValue({ message: "ignored" });
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("E-posta"), "  kimse@example.com ");
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.",
    );
    expect(forgotPassword).toHaveBeenCalledWith("kimse@example.com");
    expect(screen.getByRole("link", { name: "Giriş sayfasına dön" })).toHaveAttribute("href", "/login");
  });

  it("shows the Turkish rate limit message and the fallback for other failures", async () => {
    forgotPassword.mockRejectedValueOnce(new ApiError("Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.", 429));
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.");

    forgotPassword.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("İstek gönderilemedi. Lütfen tekrar deneyin."));
  });
});

describe("SetPasswordView", () => {
  const INFO = { purpose: "invite", email: "ayse@example.com", full_name: "Ayşe Demir" };

  async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirm: string) {
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), password);
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), confirm);
    await user.click(screen.getByRole("button", { name: "Şifreyi belirle" }));
  }

  it("greets the user, sets the password and goes to the role's home page", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role: "admin" });
    const user = userEvent.setup();
    render(<SetPasswordView />);

    expect(await screen.findByText("Merhaba Ayşe Demir, CaseBridge şifrenizi belirleyin.")).toBeInTheDocument();
    expect(getTokenInfo).toHaveBeenCalledWith("abc");
    expect(screen.getByText("En az 10 karakter olmalı ve e-posta adresinizle aynı olamaz.")).toBeInTheDocument();
    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin"));
    expect(setPassword).toHaveBeenCalledWith("abc", "yeni-guclu-sifre");
  });

  it("sends a lawyer to the dashboard", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
    const user = userEvent.setup();
    render(<SetPasswordView />);

    await screen.findByText(/Merhaba Ayşe Demir/);
    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("checks length, e-mail and confirmation before calling the server", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "kisa", "kisa");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await fill(user, "ayse@example.com", "ayse@example.com");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre e-posta adresinizle aynı olamaz.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await fill(user, "yeni-guclu-sifre", "baska-guclu-sifre");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifreler eşleşmiyor.");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("shows the server's message when the password is refused", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockRejectedValue(new ApiError("Şifre en az 10 karakter olmalı.", 422));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("explains an expired or used link and offers the way back", async () => {
    setUrl("/sifre-belirle?token=old");
    getTokenInfo.mockRejectedValue(new ApiError(LINK_INVALID, 410));
    render(<SetPasswordView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(screen.getByRole("link", { name: "Giriş sayfasına dön" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toHaveAttribute("href", "/sifremi-unuttum");
    expect(screen.queryByLabelText("Yeni şifre", { exact: true })).not.toBeInTheDocument();
  });

  it("treats a missing token like an invalid link without calling the server", async () => {
    setUrl("/sifre-belirle");
    render(<SetPasswordView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(getTokenInfo).not.toHaveBeenCalled();
  });

  it("switches to the invalid-link page when the link is used up while the form is open", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockRejectedValue(new ApiError(LINK_INVALID, 410));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toBeInTheDocument();
  });

  it("falls back to the login page when the profile cannot be read after setting the password", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
  });
});
