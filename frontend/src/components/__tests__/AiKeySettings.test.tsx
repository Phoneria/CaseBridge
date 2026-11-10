import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiKeySettings } from "@/components/AiKeySettings";
import { ApiError } from "@/lib/apiError";

const api = vi.hoisted(() => ({ getAiKeyStatus: vi.fn(), saveAiKey: vi.fn(), activateAiKey: vi.fn() }));
vi.mock("@/lib/api", () => api);
const KEY = "sk-test-secret-not-a-real-key";
beforeEach(() => {
  vi.clearAllMocks();
  api.getAiKeyStatus.mockResolvedValue({ configured: true, managed: false, can_save: true });
});

describe("AI key entry", () => {
  it("masks the key, saves once and shows the verified connection", async () => {
    const onSaved = vi.fn();
    const result = { connected: true, checks: [], checked_at: 1 };
    api.saveAiKey.mockResolvedValue({ configured: true, managed: false, pending: true, can_save: true });
    api.activateAiKey.mockResolvedValue(result);
    render(<AiKeySettings onSaved={onSaved} />);
    const add = await screen.findByRole("button", { name: "Gizli anahtar ekle" });
    await userEvent.click(add);
    const input = screen.getByLabelText("OpenAI API anahtarı");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, KEY);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet ve bağlantıyı kontrol et" }));
    expect(await screen.findByText("Yeni anahtar test edildi ve beklemeye alındı. Mevcut bağlantı değişmedi.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yeni anahtarı etkinleştir" }));
    expect(await screen.findByText(/Yeni anahtar etkinleştirildi. AI bağlantısı doğrulandı/)).toBeInTheDocument();
    expect(api.saveAiKey).toHaveBeenCalledTimes(1);
    expect(api.saveAiKey).toHaveBeenCalledWith(KEY);
    expect(onSaved).toHaveBeenCalledWith(result);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("openai_api_key")).toBeNull();
    await userEvent.click(add);
    expect(screen.getByLabelText("OpenAI API anahtarı")).toHaveValue("");
  });

  it("keeps the form open on a failed test and clears the rejected secret", async () => {
    api.saveAiKey.mockRejectedValue(new ApiError("Anahtar geçersiz veya süresi dolmuş.", 400));
    const onSaved = vi.fn();
    render(<AiKeySettings onSaved={onSaved} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gizli anahtar ekle" }));
    await userEvent.type(screen.getByLabelText("OpenAI API anahtarı"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet ve bağlantıyı kontrol et" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Anahtar geçersiz veya süresi dolmuş.");
    expect(screen.getByLabelText("OpenAI API anahtarı")).toHaveValue("");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("disables entry when encrypted storage is unavailable", async () => {
    api.getAiKeyStatus.mockResolvedValue({ configured: false, managed: false, can_save: false });
    render(<AiKeySettings onSaved={vi.fn()} />);
    expect(await screen.findByText(/sunucuda etkinleştirilmesi gerekiyor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gizli anahtar ekle" })).toBeDisabled();
  });
});
