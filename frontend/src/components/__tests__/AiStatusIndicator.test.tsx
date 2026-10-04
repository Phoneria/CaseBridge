import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getAiConnectivity = vi.fn();
vi.mock("@/lib/api", () => ({
  getAiConnectivity: (...args: unknown[]) => getAiConnectivity(...args),
}));

import { AiStatusIndicator } from "@/components/AiStatusIndicator";

beforeEach(() => {
  getAiConnectivity.mockReset();
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
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByText("Hizmete şu anda ulaşılamıyor.")).toBeInTheDocument();
    expect(screen.queryByText(/ollama|qwen/i)).not.toBeInTheDocument();
  });

  it("closes when the mouse leaves", async () => {
    getAiConnectivity.mockResolvedValue({ connected: true, checked_at: 0, checks: [] });
    render(<AiStatusIndicator />);
    const wrapper = (await screen.findByRole("button", { name: /AI bağlı/ })).parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show provider or token details when opened", async () => {
    getAiConnectivity.mockResolvedValue({ connected: true, checked_at: 0, checks: [] });
    render(<AiStatusIndicator />);
    const wrapper = (await screen.findByRole("button", { name: /AI bağlı/ })).parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.queryByText(/token|openai|gpt/i)).not.toBeInTheDocument();
  });

  it("is offline when the backend is unreachable and can re-check", async () => {
    getAiConnectivity.mockRejectedValue(new Error("down"));
    render(<AiStatusIndicator />);
    fireEvent.mouseEnter((await screen.findByRole("button", { name: /AI bağlantısı yok/ })).parentElement!);
    expect(screen.getByText("Hizmet durumuna ulaşılamadı.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yeniden kontrol et" }));
    await waitFor(() => expect(getAiConnectivity).toHaveBeenLastCalledWith(true));
  });
});
