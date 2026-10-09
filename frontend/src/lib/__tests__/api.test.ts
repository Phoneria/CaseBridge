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

  it("sends the new case list filters as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getCases } = await import("@/lib/api");
    await getCases({ outcome: "won", active: true, hearing_within_days: 30, include_archived: true });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/cases?");
    expect(url).toContain("outcome=won");
    expect(url).toContain("active=true");
    expect(url).toContain("hearing_within_days=30");
    expect(url).toContain("include_archived=true");
  });

  it("throws an ApiError carrying the HTTP status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Case not found" }),
    }) as unknown as typeof fetch;

    const { getCase } = await import("@/lib/api");
    const { ApiError } = await import("@/lib/apiError");

    await expect(getCase("missing")).rejects.toBeInstanceOf(ApiError);
    await expect(getCase("missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("chat API", () => {
  it("calls the chat endpoints with the right methods", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const api = await import("@/lib/api");

    await api.getChatStatus();
    await api.createChatConversation();
    await api.renameChatConversation("c1", "Yeni ad");
    await api.setChatFeedback("m1", -1);

    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url).replace(/^https?:\/\/[^/]+/, ""), init?.method ?? "GET"]);
    expect(calls).toEqual([
      ["/chat/status", "GET"],
      ["/chat/conversations", "POST"],
      ["/chat/conversations/c1", "PATCH"],
      ["/chat/messages/m1/feedback", "PUT"],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ title: "Yeni ad" });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ value: -1 });
  });

  it("sends the calendar range and calls the calendar event, task reminder and notification endpoints", async () => {
    window.localStorage.setItem("casebridge_token", "valid-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const api = await import("@/lib/api");
    const payload = {
      title: "Toplantı",
      event_type: "meeting" as const,
      starts_at: "2026-10-07T14:30:00",
      all_day: false,
      duration_minutes: 60,
      location: null,
      notes: null,
      case_id: null,
      assignee_id: null,
      reminder_days: [1],
    };

    await api.getCalendarEvents({ from: "2026-10-01", to: "2026-10-31" });
    await api.createCalendarEvent(payload);
    await api.updateCalendarEvent("e1", { reminder_days: [] });
    await api.updateTaskReminders("t1", [3, 1]);
    await api.getNotificationStatus();
    await api.sendTestEmail();

    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body ?? null]);
    expect(calls).toEqual([
      ["http://localhost:8000/calendar?from=2026-10-01&to=2026-10-31", "GET", null],
      ["http://localhost:8000/calendar/events", "POST", JSON.stringify(payload)],
      ["http://localhost:8000/calendar/events/e1", "PATCH", JSON.stringify({ reminder_days: [] })],
      ["http://localhost:8000/tasks/t1", "PATCH", JSON.stringify({ reminder_days: [3, 1] })],
      ["http://localhost:8000/notifications/status", "GET", null],
      ["http://localhost:8000/notifications/test-email", "POST", null],
    ]);
  });

  it("deleteCalendarEvent accepts a 204 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error("no body"); } });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { deleteCalendarEvent } = await import("@/lib/api");

    await expect(deleteCalendarEvent("e1")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/calendar/events/e1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});


describe("case intake API", () => {
  it("posts the file or the pasted text as multipart form data without a JSON content type", async () => {
    window.localStorage.setItem("casebridge_token", "valid-token");
    const result = { draft: {}, truncated: false, source_chars: 12 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => result });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { extractCaseIntake } = await import("@/lib/api");

    const file = new File(["metin"], "dilekce.txt", { type: "text/plain" });
    await expect(extractCaseIntake({ file })).resolves.toEqual(result);
    await extractCaseIntake({ text: "yapıştırılan" });

    const [fileUrl, fileInit] = fetchMock.mock.calls[0];
    expect(String(fileUrl)).toMatch(/\/case-intake\/extract$/);
    expect(fileInit.method).toBe("POST");
    expect(fileInit.body).toBeInstanceOf(FormData);
    expect((fileInit.body as FormData).get("file")).toBe(file);
    expect((fileInit.body as FormData).has("text")).toBe(false);
    expect(new Headers(fileInit.headers).has("Content-Type")).toBe(false);
    expect(new Headers(fileInit.headers).get("Authorization")).toBe("Bearer valid-token");
    const textBody = fetchMock.mock.calls[1][1].body as FormData;
    expect(textBody.get("text")).toBe("yapıştırılan");
    expect(textBody.has("file")).toBe(false);
  });

  it("surfaces the backend detail as the error message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Bu belgeden metin çıkarılamadı (taranmış olabilir). Metni yapıştırabilirsiniz." }),
    }) as unknown as typeof fetch;
    const { extractCaseIntake } = await import("@/lib/api");

    await expect(extractCaseIntake({ text: "x" })).rejects.toMatchObject({
      status: 422,
      message: "Bu belgeden metin çıkarılamadı (taranmış olabilir). Metni yapıştırabilirsiniz.",
    });
  });

  it("sends and updates cases with parties", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createCase, updateCase } = await import("@/lib/api");
    const parties = [{ name: "A", role: "plaintiff" as const, is_client: true, counsel_name: null }];

    await createCase({ case_number: "1", case_name: "Dava", case_type: "diger", status: "devam_eden", parties });
    await updateCase("c1", { parties });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).parties).toEqual(parties);
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ parties });
  });
});
