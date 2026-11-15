import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSufleStatus: vi.fn(), analyzeSufle: vi.fn(), transcribeSufle: vi.fn() }));
vi.mock("@/lib/api", () => api);
import { SufleView } from "@/components/ai/SufleView";
const card = { priority: "important", category: "deadline", title: "Tarihi doğrulayın", reason: "Teslim günü belirsiz.", question: "Zarf mevcut mu?", source_id: 2, source_quote: "Zarf yanımda değil." };
const result = { cards: [card], summary: "", open_questions: [], documents: [], model: "test", total_tokens: 80 };
beforeEach(() => {
  api.getSufleStatus.mockReset().mockResolvedValue({ configured: true, model: "test" });
  api.analyzeSufle.mockReset().mockResolvedValue(result);
  api.transcribeSufle.mockReset();
});
async function ready() {
  render(<SufleView />);
  await screen.findByText(/GPT bağlantısı hazır/);
  fireEvent.click(screen.getByRole("checkbox"));
}
async function loadDemo() {
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Kurgu örneği yükle" }));
}
describe("Sufle", () => {
  it("requires acknowledgement and offers the complete examples", async () => {
    render(<SufleView />);
    await screen.findByText(/GPT bağlantısı hazır/);
    expect(screen.getByRole("button", { name: "Mikrofonu başlat" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /20 örnek/ })).toHaveAttribute("href", "/sufle/ornekler.html");
    expect(screen.getByRole("link", { name: /Örnek dosyasını indir/ })).toHaveAttribute("download");
    expect(api.analyzeSufle).not.toHaveBeenCalled();
  });
  it("loads six synthetic turns without making a paid request, then calls GPT explicitly", async () => {
    await loadDemo();
    expect(screen.getAllByRole("textbox", { name: /konuşma metni/ })).toHaveLength(6);
    expect(api.analyzeSufle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    expect(await screen.findByText("Tarihi doğrulayın")).toBeInTheDocument();
    expect(api.analyzeSufle.mock.calls[0][0]).toMatchObject({ acknowledged: true, mode: "live", focus: "İcra / alacak" });
  });
  it("retains text after errors and supports retry", async () => {
    await loadDemo();
    api.analyzeSufle.mockRejectedValueOnce(new Error("GPT bağlantısı kesildi"));
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GPT bağlantısı kesildi");
    expect(screen.getAllByRole("textbox", { name: /konuşma metni/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    expect(await screen.findByText("Tarihi doğrulayın")).toBeInTheDocument();
  });
  it("sends marked questions to suppress repetition", async () => {
    await loadDemo();
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    fireEvent.click(await screen.findByRole("button", { name: "Soruldu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    await waitFor(() => expect(api.analyzeSufle).toHaveBeenCalledTimes(2));
    expect(api.analyzeSufle.mock.calls[1][0].previous_questions).toEqual([card.question]);
  });
  it("clears stale cards on correction and sends the corrected transcript", async () => {
    await loadDemo();
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    await screen.findByText("Tarihi doğrulayın");
    fireEvent.change(screen.getByLabelText("2. konuşma metni"), { target: { value: "Zarf bugün bana teslim edildi." } });
    expect(screen.queryByText("Tarihi doğrulayın")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    await waitFor(() => expect(api.analyzeSufle).toHaveBeenCalledTimes(2));
    expect(api.analyzeSufle.mock.calls[1][0].turns[1].text).toBe("Zarf bugün bana teslim edildi.");
  });
  it("finishes with a draft summary and stops new input", async () => {
    await loadDemo();
    api.analyzeSufle.mockResolvedValueOnce({ ...result, cards: [], summary: "Bildirim tarihi doğrulanmadı.", documents: ["Ödeme emri"], open_questions: ["Teslim tarihi nedir?"] });
    fireEvent.click(screen.getByRole("button", { name: "Bitir ve özetle" }));
    expect(await screen.findByRole("region", { name: "Görüşme özeti" })).toHaveTextContent("Bildirim tarihi doğrulanmadı.");
    expect(api.analyzeSufle.mock.calls[0][0].mode).toBe("summary");
    expect(screen.getByRole("button", { name: "Mikrofonla devam et" })).toBeDisabled();
  });
  it("blocks GPT when the bureau key is absent", async () => {
    api.getSufleStatus.mockResolvedValue({ configured: false, model: "test" });
    render(<SufleView />);
    await screen.findByText("Büronuzun GPT bağlantısı hazır değil.");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Kurgu örneği yükle" })).toBeDisabled();
    expect(api.analyzeSufle).not.toHaveBeenCalled();
  });
  it("aborts an in-flight analysis when leaving the page", async () => {
    api.analyzeSufle.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<SufleView />);
    await screen.findByText(/GPT bağlantısı hazır/);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Kurgu örneği yükle" }));
    fireEvent.click(screen.getByRole("button", { name: "Sufle iste" }));
    const signal = api.analyzeSufle.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
