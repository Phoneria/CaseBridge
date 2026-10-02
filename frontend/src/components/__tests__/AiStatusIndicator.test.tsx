import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getAiConnectivity = vi.fn();
const getAiUsage = vi.fn();
vi.mock("@/lib/api", () => ({
  getAiConnectivity: (...args: unknown[]) => getAiConnectivity(...args),
  getAiUsage: (...args: unknown[]) => getAiUsage(...args),
}));

import { AiStatusIndicator } from "@/components/AiStatusIndicator";

beforeEach(() => {
  getAiConnectivity.mockReset();
  getAiUsage.mockReset();
  getAiUsage.mockResolvedValue({
    period_start: "2026-10-01", used_tokens: 250, budget_tokens: 1000, remaining_percent: 75, unlimited: false,
  });
});

describe("AiStatusIndicator", () => {
  it("shows green online state when connected", async () => {
    getAiConnectivity.mockResolvedValue({
      connected: true,
      checked_at: 0,
      checks: [{ name: "Analiz", provider: "ollama", model: "qwen3.5:9b", reachable: true, detail: null }],
    });
    render(<AiStatusIndicator />);
    const button = await screen.findByRole("button", { name: /AI bağlı/ });
    expect(button).toHaveAttribute("data-state", "online");
  });

  it("shows red offline state with details", async () => {
    getAiConnectivity.mockResolvedValue({
      connected: false,
      checked_at: 0,
      checks: [
        { name: "Analiz", provider: "ollama", model: "qwen3.5:9b", reachable: false, detail: "Ollama sunucusuna ulaşılamadı." },
      ],
    });
    render(<AiStatusIndicator />);
    const button = await screen.findByRole("button", { name: /AI bağlantısı yok/ });
    expect(button).toHaveAttribute("data-state", "offline");
    fireEvent.click(button);
    expect(screen.getByText("Ollama sunucusuna ulaşılamadı.")).toBeInTheDocument();
    expect(await screen.findByTestId("ai-remaining")).toHaveTextContent("%75");
  });

  it("does not fetch usage until opened", async () => {
    getAiConnectivity.mockResolvedValue({ connected: true, checked_at: 0, checks: [] });
    render(<AiStatusIndicator />);
    await screen.findByRole("button", { name: /AI bağlı/ });
    expect(getAiUsage).not.toHaveBeenCalled();
  });

  it("is offline when the backend is unreachable and can re-check", async () => {
    getAiConnectivity.mockRejectedValue(new Error("down"));
    render(<AiStatusIndicator />);
    fireEvent.click(await screen.findByRole("button", { name: /AI bağlantısı yok/ }));
    expect(screen.getByText("Backend sunucusuna ulaşılamadı.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yeniden kontrol et" }));
    await waitFor(() => expect(getAiConnectivity).toHaveBeenLastCalledWith(true));
  });
});
