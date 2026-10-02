import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_LEVEL_OPTIONS,
  CHAT_LEVEL_STORAGE_KEY,
  DEFAULT_CHAT_LEVEL,
  answerLabel,
  isChatLevel,
  readStoredChatLevel,
  storeChatLevel,
} from "@/lib/chatLevels";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("chat levels", () => {
  it("lists the three levels in order with Turkish labels", () => {
    expect(CHAT_LEVEL_OPTIONS.map((option) => [option.level, option.label])).toEqual([
      ["basic", "Basit"],
      ["standard", "Standart"],
      ["deep", "Kapsamlı"],
    ]);
    expect(DEFAULT_CHAT_LEVEL).toBe("standard");
  });

  it("validates level names", () => {
    expect(isChatLevel("basic")).toBe(true);
    expect(isChatLevel("expert")).toBe(false);
    expect(isChatLevel(null)).toBe(false);
  });

  it("stores and restores the chosen level", () => {
    expect(readStoredChatLevel()).toBe("standard");
    storeChatLevel("deep");
    expect(window.localStorage.getItem(CHAT_LEVEL_STORAGE_KEY)).toBe("deep");
    expect(readStoredChatLevel()).toBe("deep");
  });

  it("falls back to standard for invalid or unreadable storage", () => {
    window.localStorage.setItem(CHAT_LEVEL_STORAGE_KEY, "expert");
    expect(readStoredChatLevel()).toBe("standard");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredChatLevel()).toBe("standard");
    expect(() => storeChatLevel("basic")).not.toThrow();
  });

  it("builds the answer label from level and model", () => {
    expect(answerLabel("basic", "gpt-4o-mini")).toBe("Basit · gpt-4o-mini");
    expect(answerLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(answerLabel(undefined, null)).toBeNull();
  });
});
