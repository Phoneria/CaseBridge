import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/apiError";
import { createSseParser, streamChatMessage } from "@/lib/chatStream";
import type { ChatStreamEvent } from "@/types";

const originalFetch = global.fetch;

function bodyFrom(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader: () => ({
      read: async () =>
        index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined },
      releaseLock: () => {},
    }),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createSseParser", () => {
  it("emits every event in a chunk, including several at once", () => {
    const events: ChatStreamEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('data: {"type":"delta","text":"Mer"}\n\ndata: {"type":"delta","text":"haba"}\n\n');

    expect(events).toEqual([
      { type: "delta", text: "Mer" },
      { type: "delta", text: "haba" },
    ]);
  });

  it("buffers an event split across chunks", () => {
    const events: ChatStreamEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('data: {"type":"del');
    expect(events).toEqual([]);
    parser.push('ta","text":"ş"}\n');
    expect(events).toEqual([]);
    parser.push("\n");

    expect(events).toEqual([{ type: "delta", text: "ş" }]);
  });

  it("ignores comments, blank blocks and malformed JSON", () => {
    const events: ChatStreamEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push(': keep-alive\n\n\n\ndata: not-json\n\ndata: {"type":"error","message":"x"}\n\n');

    expect(events).toEqual([{ type: "error", message: "x" }]);
  });
});

describe("streamChatMessage", () => {
  it("POSTs with the token and forwards every SSE event", async () => {
    window.localStorage.setItem("casebridge_token", "t1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: bodyFrom([
        'data: {"type":"start","user_message":{"id":"u1"},"assistant_message_id":"a1"}\n\ndata: {"type":"delta",',
        '"text":"Selam"}\n\n',
        'data: {"type":"done","message":{"id":"a1"}}\n\n',
      ]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const events: ChatStreamEvent[] = [];

    await streamChatMessage("c1", "Merhaba", { onEvent: (event) => events.push(event) });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat\/conversations\/c1\/messages$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ content: "Merhaba" });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer t1");
    expect(events.map((event) => event.type)).toEqual(["start", "delta", "done"]);
    expect(events[1]).toEqual({ type: "delta", text: "Selam" });
  });

  it("throws ApiError with the backend detail on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Sohbet modeli yapılandırılmamış." }),
    }) as unknown as typeof fetch;

    const promise = streamChatMessage("c1", "Merhaba", { onEvent: () => {} });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 503, message: "Sohbet modeli yapılandırılmamış." });
  });
});
