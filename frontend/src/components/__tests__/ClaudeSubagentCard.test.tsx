import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getClaudeSubagent: vi.fn(),
  saveClaudeSubagentToken: vi.fn(),
  removeClaudeSubagentToken: vi.fn(),
  testClaudeSubagent: vi.fn(),
  setClaudeSubagentUsers: vi.fn(),
  searchClaudeSubagentUsers: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

import { ClaudeSubagentCard, PERSONAL_USE_NOTE, SETUP_HELP } from "@/components/ai/ClaudeSubagentCard";
import { AiModelStatus, providerBadge } from "@/components/ai/AiModelStatus";
import type { ClaudeSubagentSettings } from "@/types";

const EMPTY: ClaudeSubagentSettings = { set: false, last4: null, updated_at: null, status: "none", checked_at: null, users: [] };
const OWNER = { id: "u1", full_name: "İzzet Ahmet", email: "izzet@example.com", firm_name: "Demo Hukuk", is_active: true, is_platform_admin: false };
const SAVED: ClaudeSubagentSettings = { ...EMPTY, set: true, last4: "WXYZ", updated_at: "2026-11-25T10:00:00+00:00", status: "unknown" };
const TOKEN = "sk-ant-oat01-Synthetic_Test_Token_0123456789abcdefWXYZ";

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getClaudeSubagent.mockResolvedValue(EMPTY);
  api.searchClaudeSubagentUsers.mockResolvedValue([OWNER]);
});

describe("ClaudeSubagentCard", () => {
  it("explains personal use and how to get the token, and starts without one", async () => {
    render(<ClaudeSubagentCard />);
    expect(await screen.findByText(PERSONAL_USE_NOTE)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SETUP_HELP.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("claude-subagent-badge")).toHaveTextContent("Yok"));
    expect(screen.getByLabelText("Setup token")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Test et" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kaldır" })).toBeDisabled();
  });

  it("saves the token without keeping it in the page, then tests it", async () => {
    const user = userEvent.setup();
    api.saveClaudeSubagentToken.mockResolvedValue(SAVED);
    api.testClaudeSubagent.mockResolvedValue({ ok: true, message: "Bağlantı çalışıyor.", status: "ok" });
    render(<ClaudeSubagentCard />);
    await user.type(await screen.findByLabelText("Setup token"), TOKEN);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(api.saveClaudeSubagentToken).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => expect(screen.getByLabelText("Setup token")).toHaveValue(""));
    expect(screen.getByText("••••WXYZ")).toBeInTheDocument();
    expect(screen.getByTestId("claude-subagent-badge")).toHaveTextContent("Test edilmedi");
    expect(document.body.innerHTML).not.toContain(TOKEN);

    api.getClaudeSubagent.mockResolvedValue({ ...SAVED, status: "ok" });
    await user.click(screen.getByRole("button", { name: "Test et" }));
    expect(await screen.findByText("Bağlantı çalışıyor.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("claude-subagent-badge")).toHaveTextContent("Aktif"));
  });

  it("shows the invalid-token message and lets the token be removed", async () => {
    const user = userEvent.setup();
    api.getClaudeSubagent.mockResolvedValue({ ...SAVED, status: "invalid" });
    api.removeClaudeSubagentToken.mockResolvedValue(EMPTY);
    render(<ClaudeSubagentCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Token geçersiz, yenileyin.");
    expect(screen.getByTestId("claude-subagent-badge")).toHaveTextContent("Geçersiz");
    await user.click(screen.getByRole("button", { name: "Kaldır" }));
    await waitFor(() => expect(screen.getByTestId("claude-subagent-badge")).toHaveTextContent("Yok"));
  });

  it("adds and removes the accounts the token serves", async () => {
    const user = userEvent.setup();
    api.getClaudeSubagent.mockResolvedValue(SAVED);
    api.setClaudeSubagentUsers.mockResolvedValueOnce({ ...SAVED, users: [OWNER] }).mockResolvedValueOnce(SAVED);
    render(<ClaudeSubagentCard />);
    expect(await screen.findByText("Henüz hesap seçilmedi; token hiçbir istekte kullanılmaz.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Hesap ekle"), "izz");
    const results = await screen.findByRole("list", { name: "Arama sonuçları" });
    await user.click(within(results).getByRole("button", { name: /izzet@example.com/ }));
    expect(api.setClaudeSubagentUsers).toHaveBeenCalledWith(["u1"]);
    const chosen = await screen.findByRole("list", { name: "Seçili hesaplar" });
    expect(chosen).toHaveTextContent("İzzet Ahmet · izzet@example.com · Demo Hukuk");
    await user.click(within(chosen).getByRole("button", { name: "izzet@example.com hesabını çıkar" }));
    expect(api.setClaudeSubagentUsers).toHaveBeenLastCalledWith([]);
  });
});

describe("AI provider badge", () => {
  it("names Claude or OpenAI next to the configured status", () => {
    expect(providerBadge("claude-subagent")).toBe("Claude");
    expect(providerBadge("anthropic")).toBe("Claude");
    expect(providerBadge("openai")).toBe("OpenAI");
    expect(providerBadge("mock")).toBeNull();
    const { rerender } = render(<AiModelStatus status={{ provider: "claude-subagent", configured: true, error: null }} variant="dark" />);
    expect(screen.getByTestId("ai-provider-badge")).toHaveTextContent("Claude");
    rerender(<AiModelStatus status={{ provider: "claude-subagent", configured: false, error: "x" }} variant="dark" />);
    expect(screen.getByRole("status")).toHaveTextContent("Claude token geçersiz, yenileyin.");
  });
});
