import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const api = vi.hoisted(() => ({
  getChatStatus: vi.fn(),
  createChatConversation: vi.fn(),
  getChatConversation: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const streamChatMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chatStream", () => ({ streamChatMessage }));

import { AiMascot } from "@/components/mascot/AiMascot";
import { canUseAiAssistant } from "@/components/AppShell";
import { MASCOT_EMPTY_TITLE, MASCOT_NOT_CONFIGURED } from "@/components/mascot/MascotChatPanel";
import { announceCaseViewed, POSITION_STORAGE_KEY, SLEEP_AFTER_MS } from "@/lib/mascot";
import type { AppUser, ChatStreamEvent } from "@/types";

type StreamOptions = { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void; dataTools?: boolean; context?: unknown };

const STATUS = { provider: "mock", model: "mock", configured: true, external: false, error: null };
const SOURCES = [
  { kind: "case", id: "c1", label: "2026/1 · Kira Uyuşmazlığı", href: "/davalar/c1" },
  { kind: "document", id: "d1", label: "dilekce.pdf · 2026/1", href: "/davalar/c1?sekme=belgeler&belge=d1" },
];

// jsdom has no PointerEvent: without it fireEvent drops clientX, button and pointerId.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

function cat() {
  return screen.getByTestId("ai-mascot");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  resetNav();
  setUrl("/dashboard");
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  streamChatMessage.mockReset();
  api.getChatStatus.mockResolvedValue(STATUS);
  api.getChatConversation.mockResolvedValue({ id: "conv-1", title: "x", updated_at: "", messages: [] });
  api.createChatConversation.mockResolvedValue({ id: "conv-1", title: "Yeni sohbet", updated_at: "2026-11-24T10:00:00" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
});

describe("AiMascot widget", () => {
  it("is offered only to users who may use CaseBridge AI", () => {
    const base = { id: "u", role: "lawyer", is_platform_admin: false, workspace_position: null } as unknown as AppUser;
    expect(canUseAiAssistant(base)).toBe(true);
    expect(canUseAiAssistant({ ...base, workspace_position: "stajyer" } as AppUser)).toBe(false);
    expect(canUseAiAssistant({ ...base, is_platform_admin: true } as AppUser)).toBe(false);
    expect(canUseAiAssistant(null)).toBe(false);
  });

  it("drags with the pointer, snaps to the nearest edge and remembers the position", async () => {
    // jsdom has no layout: report the button's own style position as its rect.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: 80, height: 80 } as DOMRect;
    });
    const { unmount } = render(<AiMascot random={() => 1} />);
    expect(cat()).toHaveAttribute("data-side", "right");
    fireEvent.pointerDown(cat(), { button: 0, pointerId: 1, clientX: 1100, clientY: 700 });
    fireEvent.pointerMove(cat(), { pointerId: 1, clientX: 600, clientY: 500 });
    fireEvent.pointerMove(cat(), { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(cat(), { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.click(cat()); // the click that ends a drag does not open the panel
    expect(cat()).toHaveAttribute("data-side", "left");
    expect(cat().style.left).toBe("16px");
    expect(cat().style.top).toBe("288px"); // grabbed 12px below its top edge (default top 688)
    expect(screen.queryByTestId("mascot-panel")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY)!)).toEqual({ side: "left", top: 288 });
    unmount();

    render(<AiMascot random={() => 1} />);
    expect(cat()).toHaveAttribute("data-side", "left");
    expect(cat().style.top).toBe("288px");
    vi.restoreAllMocks();
  });

  it("keeps the saved position inside a smaller window and survives broken storage", () => {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ side: "right", top: 760 }));
    render(<AiMascot random={() => 1} />);
    expect(cat().style.top).toBe("704px"); // 800 - 80 - 16
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    act(() => void window.dispatchEvent(new Event("resize")));
    expect(cat().style.top).toBe("304px");
  });

  it("works when localStorage throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      render(<AiMascot random={() => 1} />);
      fireEvent.pointerDown(cat(), { button: 0, pointerId: 1, clientX: 1100, clientY: 700 });
      fireEvent.pointerMove(cat(), { pointerId: 1, clientX: 100, clientY: 200 });
      fireEvent.pointerUp(cat(), { pointerId: 1, clientX: 100, clientY: 200 });
      expect(cat()).toHaveAttribute("data-side", "left");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("opens on click, closes with Escape and the minimise button, and toggles with ⌘J / Ctrl+J", async () => {
    const user = userEvent.setup();
    render(<AiMascot random={() => 1} />);
    await user.click(cat());
    const panel = await screen.findByRole("dialog", { name: "CaseBridge AI asistanı" });
    expect(cat()).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByLabelText("CaseBridge AI'a sorun")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(cat()).toHaveFocus());

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "J", ctrlKey: true });
    await user.click(await screen.findByRole("button", { name: "Paneli küçült" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be hidden and brought back", async () => {
    const user = userEvent.setup();
    render(<AiMascot random={() => 1} />);
    await user.click(cat());
    await user.click(await screen.findByRole("button", { name: "Kediyi gizle" }));
    expect(screen.queryByTestId("ai-mascot")).toBeNull();
    expect(window.localStorage.getItem("cb.mascot.hidden")).toBe("1");
    await user.click(screen.getByRole("button", { name: "CaseBridge AI'ı göster" }));
    expect(cat()).toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("changes pose while a question is answered with data tools and shows source chips", async () => {
    const user = userEvent.setup();
    setUrl("/davalar/c1");
    const gate = { tool: deferred(), delta: deferred(), end: deferred() };
    streamChatMessage.mockImplementation(async (_id: string, _text: string, options: StreamOptions) => {
      options.onEvent({ type: "start", user_message: { id: "u1", role: "user", content: "q", created_at: "" } as never, assistant_message_id: "a1" });
      await gate.tool.promise;
      options.onEvent({ type: "tool", name: "get_hearings", status: "start" });
      await gate.delta.promise;
      options.onEvent({ type: "sources", sources: SOURCES as never });
      options.onEvent({ type: "delta", text: "Duruşma 5 Aralık'ta." });
      await gate.end.promise;
      options.onEvent({ type: "done", message: null, sources: SOURCES as never });
    });
    render(<AiMascot random={() => 1} />);
    await user.click(cat());
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Bu davanın duruşmaları ne zaman?" }));

    await waitFor(() => expect(cat()).toHaveAttribute("data-mode", "thinking"));
    const options = streamChatMessage.mock.calls[0][2] as StreamOptions;
    expect(streamChatMessage.mock.calls[0][0]).toBe("conv-1");
    expect(options.dataTools).toBe(true);
    expect(options.context).toEqual({ route: "/davalar/c1", case_id: "c1" });

    await act(async () => gate.tool.resolve());
    await waitFor(() => expect(cat()).toHaveAttribute("data-mode", "researching"));
    expect(within(panel).getByText("Duruşmalara bakılıyor…")).toBeInTheDocument();

    await act(async () => gate.delta.resolve());
    await waitFor(() => expect(cat()).toHaveAttribute("data-mode", "working"));

    await act(async () => gate.end.resolve());
    await waitFor(() => expect(cat()).toHaveAttribute("data-mode", "idle"));
    const chips = within(panel).getByRole("list", { name: "Kaynaklar" });
    expect(within(chips).getByRole("link", { name: /Kira Uyuşmazlığı/ })).toHaveAttribute("href", "/davalar/c1");
    expect(within(chips).getByRole("link", { name: /dilekce\.pdf/ })).toHaveAttribute("href", "/davalar/c1?sekme=belgeler&belge=d1");
    expect(window.sessionStorage.getItem("cb.mascot.conversation")).toBe("conv-1");
  });

  it("shows the empty, not-configured and error states", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AiMascot random={() => 1} />);
    await user.click(cat());
    expect(await screen.findByText(MASCOT_EMPTY_TITLE)).toBeInTheDocument();

    api.createChatConversation.mockRejectedValueOnce(new Error("Sohbet oluşturulamadı."));
    await user.type(screen.getByLabelText("CaseBridge AI'a sorun"), "Açık görevlerim{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sohbet oluşturulamadı.");
    expect(cat()).toHaveAttribute("data-mode", "idle");

    streamChatMessage.mockImplementationOnce(async (_id: string, _text: string, options: StreamOptions) => {
      options.onEvent({ type: "error", message: "AI sağlayıcısı bir hata döndürdü." });
    });
    await user.type(screen.getByLabelText("CaseBridge AI'a sorun"), "Tekrar{Enter}");
    expect(await screen.findByText("AI sağlayıcısı bir hata döndürdü.")).toBeInTheDocument();
    unmount();

    window.sessionStorage.clear();
    api.getChatStatus.mockResolvedValue({ ...STATUS, configured: false, error: "Büronuzun AI anahtarı tanımlı değil." });
    render(<AiMascot random={() => 1} />);
    await user.click(cat());
    expect(await screen.findByText(MASCOT_NOT_CONFIGURED)).toBeInTheDocument();
    expect(screen.getByText("Büronuzun AI anahtarı tanımlı değil.")).toBeInTheDocument();
    expect(screen.getByLabelText("CaseBridge AI'a sorun")).toBeDisabled();
  });

  it("uses page poses, celebrates a won case once and falls asleep when idle", () => {
    vi.useFakeTimers();
    try {
      setUrl("/ai/durusma");
      const { unmount } = render(<AiMascot random={() => 1} />);
      expect(cat()).toHaveAttribute("data-mode", "courtroom");
      unmount();

      setUrl("/davalar/c9");
      render(<AiMascot random={() => 1} />);
      expect(cat()).toHaveAttribute("data-mode", "idle");
      act(() => announceCaseViewed({ id: "c9", outcome: "won" }));
      expect(cat()).toHaveAttribute("data-mode", "victory");
      act(() => void vi.advanceTimersByTime(6000));
      expect(cat()).toHaveAttribute("data-mode", "idle");
      act(() => announceCaseViewed({ id: "c9", outcome: "won" }));
      expect(cat()).toHaveAttribute("data-mode", "idle"); // once per case
      act(() => announceCaseViewed({ id: "c10", outcome: "lost" }));
      expect(cat()).toHaveAttribute("data-mode", "idle");

      act(() => void vi.advanceTimersByTime(SLEEP_AFTER_MS));
      expect(cat()).toHaveAttribute("data-mode", "sleeping");
      act(() => void window.dispatchEvent(new Event("keydown")));
      expect(cat()).toHaveAttribute("data-mode", "idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays a rare idle variant when the dice allow it", () => {
    vi.useFakeTimers();
    try {
      render(<AiMascot random={() => 0} />);
      act(() => void vi.advanceTimersByTime(60_000));
      expect(cat()).toHaveAttribute("data-mode", "tea-break");
      act(() => void vi.advanceTimersByTime(8_000));
      expect(cat()).toHaveAttribute("data-mode", "idle");
      act(() => void vi.advanceTimersByTime(60_000));
      expect(cat()).toHaveAttribute("data-mode", "idle"); // not again within ten minutes
    } finally {
      vi.useRealTimers();
    }
  });
});
