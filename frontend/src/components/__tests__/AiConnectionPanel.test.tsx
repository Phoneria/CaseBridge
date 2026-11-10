import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiConnectionPanel } from "@/components/AiConnectionPanel";

const getAiConnectivity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ getAiConnectivity }));

beforeEach(() => getAiConnectivity.mockReset());

describe("AI connection diagnostics", () => {
  it("shows safe guidance for missing credentials without displaying provider payloads", async () => {
    getAiConnectivity.mockResolvedValue({ connected: false, checked_at: 0, checks: [
      { name: "Analiz", provider: "openai", model: "private-model", reachable: false, detail: "API anahtarı tanımlı değil." },
      { name: "Hukuk Asistanı", provider: "openai", model: "private-model", reachable: false, detail: "unexpected secret-value payload" },
    ] });
    render(<AiConnectionPanel />);
    expect(await screen.findByText(/AI erişim anahtarı eksik/)).toBeInTheDocument();
    expect(screen.getByText(/AI hizmetine ulaşılamadı/)).toBeInTheDocument();
    expect(screen.queryByText(/private-model|secret-value/)).not.toBeInTheDocument();
  });

  it("recovers from an unavailable backend and forces a new check", async () => {
    getAiConnectivity.mockRejectedValueOnce(new Error("internal error"));
    getAiConnectivity.mockResolvedValueOnce({ connected: true, checked_at: 1, checks: [
      { name: "Analiz", provider: "openai", model: "model", reachable: true, detail: null },
    ] });
    render(<AiConnectionPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Bağlantı durumu alınamadı.");
    await userEvent.click(screen.getByRole("button", { name: "Bağlantıyı yeniden kontrol et" }));
    expect(await screen.findByText("AI hizmetlerine bağlantı doğrulandı.")).toBeInTheDocument();
    expect(getAiConnectivity).toHaveBeenLastCalledWith(true);
  });
});
