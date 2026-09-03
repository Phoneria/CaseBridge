import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;
const originalLocation = window.location;

beforeEach(() => {
  window.localStorage.clear();
  // @ts-expect-error - jsdom allows redefining location for tests
  delete window.location;
  window.location = { ...originalLocation, href: "http://localhost:3000/dashboard" } as Location;
});

afterEach(() => {
  global.fetch = originalFetch;
  window.location = originalLocation;
  vi.restoreAllMocks();
});

describe("api request()", () => {
  it("clears the token and redirects to /login on a 401 response", async () => {
    window.localStorage.setItem("casebridge_token", "expired-token");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Could not validate credentials" }),
    }) as unknown as typeof fetch;

    const { listAllTasks } = await import("@/lib/api");

    await expect(listAllTasks()).rejects.toThrow();

    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
    expect(window.location.href).toContain("/login");
  });

  it("does not redirect on a non-401 error", async () => {
    window.localStorage.setItem("casebridge_token", "valid-token");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Internal error" }),
    }) as unknown as typeof fetch;

    const { listAllTasks } = await import("@/lib/api");

    await expect(listAllTasks()).rejects.toThrow();

    expect(window.localStorage.getItem("casebridge_token")).toBe("valid-token");
    expect(window.location.href).not.toContain("/login");
  });
});
