import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateNewPassword } from "@/lib/passwordRules";
import { userMessage } from "@/lib/userMessages";
import { ApiError } from "@/lib/apiError";

const originalFetch = global.fetch;
const originalLocation = window.location;

function mockFetch(body: unknown = {}, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => [
    String(url).replace(/^https?:\/\/[^/]+/, ""),
    init?.method ?? "GET",
    init?.body ?? null,
  ]);
}

beforeEach(() => {
  window.localStorage.clear();
  // @ts-expect-error - jsdom allows redefining location for tests
  delete window.location;
  window.location = { ...originalLocation, href: "http://localhost:3000/ayarlar" } as Location;
});

afterEach(() => {
  global.fetch = originalFetch;
  window.location = originalLocation;
  vi.restoreAllMocks();
});

describe("user management API", () => {
  it("calls the admin user endpoints with the right methods and bodies", async () => {
    window.localStorage.setItem("casebridge_token", "tok");
    const fetchMock = mockFetch();
    const api = await import("@/lib/api");

    await api.listManagedUsers();
    await api.createManagedUser({ email: "a@b.co", full_name: "Ad Soyad", department: "İş", role: "lawyer" });
    await api.updateManagedUser("u1", { department: null });
    await api.resendUserInvite("u1");
    await api.sendUserPasswordReset("u1");
    await api.getUserWorkload("u1");
    await api.deactivateUser("u1");
    await api.deactivateUser("u1", "u2");
    await api.activateUser("u1");
    await api.updateProfile({ full_name: "Yeni Ad" });

    expect(calls(fetchMock)).toEqual([
      ["/admin/users", "GET", null],
      ["/admin/users", "POST", JSON.stringify({ email: "a@b.co", full_name: "Ad Soyad", department: "İş", role: "lawyer" })],
      ["/admin/users/u1", "PATCH", JSON.stringify({ department: null })],
      ["/admin/users/u1/invite", "POST", null],
      ["/admin/users/u1/password-reset", "POST", null],
      ["/admin/users/u1/workload", "GET", null],
      ["/admin/users/u1/deactivate", "POST", "{}"],
      ["/admin/users/u1/deactivate", "POST", JSON.stringify({ transfer_to: "u2" })],
      ["/admin/users/u1/activate", "POST", null],
      ["/users/me", "PATCH", JSON.stringify({ full_name: "Yeni Ad" })],
    ]);
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("calls the public auth endpoints and encodes the link token", async () => {
    const fetchMock = mockFetch();
    const api = await import("@/lib/api");

    await api.getAuthConfig();
    await api.forgotPassword("a@b.co");
    await api.getTokenInfo("a+b/c=");

    expect(calls(fetchMock)).toEqual([
      ["/auth/config", "GET", null],
      ["/auth/forgot-password", "POST", JSON.stringify({ email: "a@b.co" })],
      ["/auth/token-info?token=a%2Bb%2Fc%3D", "GET", null],
    ]);
  });

  it("stores the new token after set-password and change-password", async () => {
    const api = await import("@/lib/api");

    const first = mockFetch({ access_token: "from-set-password" });
    await api.setPassword("link-token", "yeni-sifre-123");
    expect(calls(first)).toEqual([["/auth/set-password", "POST", JSON.stringify({ token: "link-token", password: "yeni-sifre-123" })]]);
    expect(window.localStorage.getItem("casebridge_token")).toBe("from-set-password");

    const second = mockFetch({ access_token: "from-change-password" });
    await api.changePassword("eski-sifre-1", "yeni-sifre-456");
    expect(calls(second)).toEqual([
      ["/auth/change-password", "POST", JSON.stringify({ current_password: "eski-sifre-1", new_password: "yeni-sifre-456" })],
    ]);
    expect(window.localStorage.getItem("casebridge_token")).toBe("from-change-password");
  });

  it("logout calls the endpoint and always clears the token", async () => {
    window.localStorage.setItem("casebridge_token", "tok");
    const fetchMock = mockFetch({ status: "logged_out" });
    const api = await import("@/lib/api");

    await api.logout();
    expect(calls(fetchMock)).toEqual([["/auth/logout", "POST", null]]);
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();

    window.localStorage.setItem("casebridge_token", "tok");
    global.fetch = vi.fn().mockRejectedValue(new TypeError("network down")) as unknown as typeof fetch;
    await expect(api.logout()).resolves.toBeUndefined();
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
  });

  it("a failed login (401) shows the message instead of reloading the page", async () => {
    window.localStorage.setItem("casebridge_token", "old-token");
    mockFetch({ detail: "E-posta veya şifre hatalı." }, 401);
    const api = await import("@/lib/api");

    await expect(api.login("a@b.co", "x")).rejects.toMatchObject({ status: 401, message: "E-posta veya şifre hatalı." });
    expect(window.location.href).toBe("http://localhost:3000/ayarlar");
    expect(window.localStorage.getItem("casebridge_token")).toBe("old-token");
  });

  it("any other 401 still clears the token and redirects to /login", async () => {
    window.localStorage.setItem("casebridge_token", "revoked");
    mockFetch({ detail: "Could not validate credentials" }, 401);
    const api = await import("@/lib/api");

    await expect(api.getMe()).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
    expect(window.location.href).toContain("/login");
  });
});

const TOO_LONG = "Şifre en fazla 72 bayt olabilir (Türkçe karakterler 2 bayt sayılır).";

describe("validateNewPassword", () => {
  it("limits the password to 72 bytes in UTF-8 (bcrypt's limit)", () => {
    expect(validateNewPassword("x".repeat(72), "x".repeat(72))).toBeNull();
    expect(validateNewPassword("ş".repeat(36), "ş".repeat(36))).toBeNull();
    expect(validateNewPassword("ş".repeat(36) + "a", "ş".repeat(36) + "a")).toBe(TOO_LONG);
  });

  it("returns the first problem in the order length, e-mail, confirmation", () => {
    expect(validateNewPassword("kisa", "kisa")).toBe("Şifre en az 10 karakter olmalı.");
    expect(validateNewPassword("x".repeat(73), "x".repeat(73))).toBe(TOO_LONG);
    expect(validateNewPassword("Avukat@Example.com", "Avukat@Example.com", "avukat@example.com")).toBe(
      "Şifre e-posta adresinizle aynı olamaz.",
    );
    expect(validateNewPassword("yeterince-uzun", "farkli-uzun-sifre", "a@b.co")).toBe("Şifreler eşleşmiyor.");
    expect(validateNewPassword("yeterince-uzun", "yeterince-uzun", "a@b.co")).toBeNull();
    expect(validateNewPassword("yeterince-uzun", "yeterince-uzun")).toBeNull();
  });
});

describe("userMessage", () => {
  it("shows only ApiError messages and otherwise the Turkish fallback", () => {
    expect(userMessage(new ApiError("Mevcut şifre hatalı.", 400), "Hata.")).toBe("Mevcut şifre hatalı.");
    expect(userMessage(new ApiError("", 500), "Hata.")).toBe("Hata.");
    expect(userMessage(new TypeError("Failed to fetch"), "Hata.")).toBe("Hata.");
    expect(userMessage("boom", "Hata.")).toBe("Hata.");
  });
});
