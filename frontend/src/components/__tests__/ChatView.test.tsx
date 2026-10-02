import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const api = vi.hoisted(() => ({
  getChatStatus: vi.fn(),
  getMe: vi.fn(),
  listChatConversations: vi.fn(),
  createChatConversation: vi.fn(),
  getChatConversation: vi.fn(),
  renameChatConversation: vi.fn(),
  deleteChatConversation: vi.fn(),
  setChatFeedback: vi.fn(),
  downloadChatExport: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const streamChatMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chatStream", () => ({ streamChatMessage }));

const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/download", () => ({ saveBlob }));

import { ChatView } from "@/components/ai/chat/ChatView";

type StreamOptions = { signal: AbortSignal; onEvent: (event: unknown) => void };

const STATUS = { provider: "openai", model: "gpt-4o-mini", configured: true, external: true, error: null };
const LAWYER = { id: "u1", email: "avukat@x.dev", full_name: "Av. Test", role: "lawyer", law_firm_id: "f1", is_active: true };
const CONVERSATION = { id: "c1", title: "Kira artışı", updated_at: "2026-10-02T10:00:00" };

function msg(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    role: "assistant",
    content: "Yanıt",
    status: "complete",
    model: "gpt-4o-mini",
    feedback: null,
    created_at: "2026-10-02T10:00:00",
    ...overrides,
  };
}

const ANSWER = msg({ id: "a1", content: "**TÜFE** oranında artar." });

function conversationList() {
  return screen.getByRole("navigation", { name: "Sohbetler" });
}

beforeEach(() => {
  window.localStorage.clear();
  resetNav();
  setUrl("/ai/sohbet");
  Object.values(api).forEach((fn) => fn.mockReset());
  streamChatMessage.mockReset();
  saveBlob.mockReset();
  api.getChatStatus.mockResolvedValue(STATUS);
  api.getMe.mockResolvedValue(LAWYER);
  api.listChatConversations.mockResolvedValue([CONVERSATION]);
  api.createChatConversation.mockResolvedValue({ id: "new1", title: "Yeni sohbet", updated_at: "2026-10-02T11:00:00" });
  api.getChatConversation.mockResolvedValue({
    ...CONVERSATION,
    messages: [msg({ id: "u1", role: "user", content: "Kira nasıl artar?", status: null, model: null }), ANSWER],
  });
});

describe("ChatView", () => {
  it("lists conversations and opens the one in the URL", async () => {
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);

    expect(await screen.findByText("TÜFE")).toBeInTheDocument();
    expect(screen.getByText("Kira nasıl artar?")).toBeInTheDocument();
    expect(api.getChatConversation).toHaveBeenCalledWith("c1");
    expect(within(conversationList()).getByRole("button", { name: /^Kira artışı/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Hukuk Asistanı" })).toBeInTheDocument();
  });

  it("renders a loaded reply that is still marked streaming as stopped", async () => {
    api.getChatConversation.mockResolvedValue({
      ...CONVERSATION,
      messages: [
        msg({ id: "u1", role: "user", content: "Kira nasıl artar?", status: null, model: null }),
        msg({ id: "a1", content: "Yarım yanıt", status: "streaming" }),
      ],
    });
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);

    expect(await screen.findByText("Yarım yanıt")).toBeInTheDocument();
    expect(screen.getByText("Durduruldu")).toBeInTheDocument();
    expect(screen.queryByText("Yanıt yazılıyor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Faydalı" })).not.toBeInTheDocument();
  });

  it("ignores a done event that carries no message", async () => {
    streamChatMessage.mockImplementation(async (_id: string, content: string, { onEvent }: StreamOptions) => {
      onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
      onEvent({ type: "delta", text: "Kısmi" });
      onEvent({ type: "done", message: null });
    });
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");

    expect(await screen.findByText("Kısmi")).toBeInTheDocument();
    expect(screen.getByText("Durduruldu")).toBeInTheDocument();
  });

  it("creates a conversation on the first message and streams the reply", async () => {
    streamChatMessage.mockImplementation(async (_id: string, content: string, { onEvent }: StreamOptions) => {
      onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
      onEvent({ type: "delta", text: "Merhaba " });
      onEvent({ type: "delta", text: "dünya" });
      onEvent({ type: "done", message: msg({ id: "a9", content: "Merhaba dünya" }) });
    });
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Selam{Enter}");

    expect(await screen.findByText("Merhaba dünya")).toBeInTheDocument();
    expect(screen.getByText("Selam")).toBeInTheDocument();
    expect(api.createChatConversation).toHaveBeenCalledTimes(1);
    expect(streamChatMessage).toHaveBeenCalledWith("new1", "Selam", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(nav.replace).toHaveBeenCalledWith("/ai/sohbet?sohbet=new1");
    expect(api.getChatConversation).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mesajınız")).toHaveValue("");
    await waitFor(() => expect(api.listChatConversations).toHaveBeenCalledTimes(2));
  });

  it("stops a streaming reply and keeps the partial text", async () => {
    streamChatMessage.mockImplementation(
      (_id: string, content: string, { signal, onEvent }: StreamOptions) =>
        new Promise((_resolve, reject) => {
          onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
          onEvent({ type: "delta", text: "Kısmi yanıt" });
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);
    await screen.findByText("TÜFE");

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");
    expect(await screen.findByText("Kısmi yanıt")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Faydalı" })).toHaveLength(1); // only the old, complete answer

    await userEvent.click(screen.getByRole("button", { name: "Durdur" }));

    expect(await screen.findByText("Durduruldu")).toBeInTheDocument();
    expect(screen.getByText("Kısmi yanıt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gönder" })).toBeInTheDocument();
  });

  it("shows provider errors on the reply", async () => {
    streamChatMessage.mockImplementation(async (_id: string, content: string, { onEvent }: StreamOptions) => {
      onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
      onEvent({ type: "error", message: "Model zaman aşımına uğradı." });
    });
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Model zaman aşımına uğradı.");
  });

  it("rates complete answers and toggles the vote off", async () => {
    api.setChatFeedback
      .mockResolvedValueOnce({ ...ANSWER, feedback: 1 })
      .mockResolvedValueOnce({ ...ANSWER, feedback: null });
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);

    const up = await screen.findByRole("button", { name: "Faydalı" });
    expect(up).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(up);
    await waitFor(() => expect(screen.getByRole("button", { name: "Faydalı" })).toHaveAttribute("aria-pressed", "true"));
    expect(api.setChatFeedback).toHaveBeenLastCalledWith("a1", 1);

    await userEvent.click(screen.getByRole("button", { name: "Faydalı" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Faydalı" })).toHaveAttribute("aria-pressed", "false"));
    expect(api.setChatFeedback).toHaveBeenLastCalledWith("a1", 0);
  });

  it("renames and deletes conversations with an inline confirmation", async () => {
    api.renameChatConversation.mockResolvedValue({ ...CONVERSATION, title: "Kira davası notları" });
    api.deleteChatConversation.mockResolvedValue(undefined);
    render(<ChatView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeniden adlandır: Kira artışı" }));
    const input = screen.getByLabelText("Sohbet adı");
    await userEvent.clear(input);
    await userEvent.type(input, "Kira davası notları{Enter}");

    expect(api.renameChatConversation).toHaveBeenCalledWith("c1", "Kira davası notları");
    expect(await within(conversationList()).findByRole("button", { name: /^Kira davası notları/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sil: Kira davası notları" }));
    expect(screen.getByText("Silinsin mi?")).toBeInTheDocument();
    expect(api.deleteChatConversation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
    expect(api.deleteChatConversation).toHaveBeenCalledWith("c1");
    expect(await screen.findByText("Henüz sohbet yok.")).toBeInTheDocument();
  });

  it("offers the training export to admins only", async () => {
    const blob = new Blob(['{"messages":[]}\n']);
    api.getMe.mockResolvedValue({ ...LAWYER, role: "admin" });
    api.downloadChatExport.mockResolvedValue(blob);
    const { unmount } = render(<ChatView />);

    await userEvent.click(await screen.findByRole("button", { name: "Eğitim verisini indir (JSONL)" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "casebridge-chat-egitim.jsonl"));
    unmount();

    api.getMe.mockResolvedValue(LAWYER);
    render(<ChatView />);
    await waitFor(() => expect(api.getMe).toHaveBeenCalledTimes(2));
    await within(screen.getByRole("navigation", { name: "Sohbetler" })).findByRole("button", { name: /^Kira artışı/ });
    expect(screen.queryByRole("button", { name: "Eğitim verisini indir (JSONL)" })).not.toBeInTheDocument();
  });

  it("disables the composer when the chat model is not configured", async () => {
    api.getChatStatus.mockResolvedValue({ ...STATUS, configured: false, error: "OPENAI_API_KEY eksik." });
    render(<ChatView />);

    await waitFor(() => expect(screen.getByLabelText("Mesajınız")).toBeDisabled());
    expect(screen.getByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
  });

  it("always shows the disclaimer and warns only for external providers", async () => {
    const { unmount } = render(<ChatView />);
    expect(await screen.findByText("Mesajlar harici bir AI sağlayıcısına gönderilir; müvekkil kişisel verisi girmeyin.")).toBeInTheDocument();
    expect(screen.getByText("CaseBridge AI hukuki danışmanlık yerine geçmez; yanıtları doğrulayın.")).toBeInTheDocument();
    unmount();

    api.getChatStatus.mockResolvedValue({ ...STATUS, provider: "ollama", external: false });
    render(<ChatView />);
    expect(await screen.findByText(/Model: ollama/)).toBeInTheDocument();
    expect(screen.queryByText(/harici bir AI sağlayıcısına/)).not.toBeInTheDocument();
    expect(screen.getByText("CaseBridge AI hukuki danışmanlık yerine geçmez; yanıtları doğrulayın.")).toBeInTheDocument();
  });

  it("sends an example question from the empty state", async () => {
    streamChatMessage.mockResolvedValue(undefined);
    render(<ChatView />);

    await userEvent.click(screen.getByRole("button", { name: "Kira artış oranı nasıl belirlenir?" }));

    await waitFor(() =>
      expect(streamChatMessage).toHaveBeenCalledWith("new1", "Kira artış oranı nasıl belirlenir?", expect.anything()),
    );
  });

  it("reloads a chat reopened from the list after leaving the one just created", async () => {
    streamChatMessage.mockImplementation(async (_id: string, content: string, { onEvent }: StreamOptions) => {
      onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
      onEvent({ type: "done", message: msg({ id: "a9", content: "Merhaba dünya" }) });
    });
    api.listChatConversations
      .mockResolvedValueOnce([CONVERSATION])
      .mockResolvedValue([{ id: "new1", title: "Selam", updated_at: "2026-10-02T11:00:00" }, CONVERSATION]);
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Selam{Enter}");
    await screen.findByText("Merhaba dünya");
    await waitFor(() => expect(api.listChatConversations).toHaveBeenCalledTimes(2));
    expect(api.getChatConversation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Yeni sohbet" }));
    await userEvent.click(await within(conversationList()).findByRole("button", { name: /^Selam/ }));

    await waitFor(() => expect(api.getChatConversation).toHaveBeenCalledWith("new1"));
  });

  it("aborts an in-flight stream when unmounted", async () => {
    let streamSignal: AbortSignal | undefined;
    streamChatMessage.mockImplementation(
      (_id: string, _content: string, { signal }: StreamOptions) =>
        new Promise((_resolve, reject) => {
          streamSignal = signal;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const { unmount } = render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");
    await waitFor(() => expect(streamSignal).toBeDefined());
    expect(streamSignal!.aborted).toBe(false);

    unmount();

    expect(streamSignal!.aborted).toBe(true);
  });

  it("aborts the stream when ?sohbet= changes to another conversation", async () => {
    let streamSignal: AbortSignal | undefined;
    streamChatMessage.mockImplementation(
      (_id: string, _content: string, { signal }: StreamOptions) =>
        new Promise((_resolve, reject) => {
          streamSignal = signal;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const { rerender } = render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");
    await waitFor(() => expect(streamSignal).toBeDefined());

    setUrl("/ai/sohbet?sohbet=c1");
    rerender(<ChatView />);

    await waitFor(() => expect(streamSignal!.aborted).toBe(true));
  });

  it("sends the selected level and remembers it", async () => {
    streamChatMessage.mockResolvedValue(undefined);
    render(<ChatView />);

    const group = screen.getByRole("radiogroup", { name: "Yanıt seviyesi" });
    expect(within(group).getByRole("radio", { name: "Standart" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(within(group).getByRole("radio", { name: "Basit" }));
    expect(within(group).getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("casebridge_chat_level")).toBe("basic");

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Selam{Enter}");
    await waitFor(() =>
      expect(streamChatMessage).toHaveBeenCalledWith("new1", "Selam", expect.objectContaining({ level: "basic" })),
    );
  });

  it("restores the stored level", async () => {
    window.localStorage.setItem("casebridge_chat_level", "deep");
    render(<ChatView />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Kapsamlı" })).toHaveAttribute("aria-checked", "true"));
  });

  it("shows each level's model in its hint", async () => {
    api.getChatStatus.mockResolvedValue({
      ...STATUS,
      levels: [
        { level: "basic", label: "Basit", model: "model-basic" },
        { level: "standard", label: "Standart", model: "model-standard" },
        { level: "deep", label: "Kapsamlı", model: "model-deep" },
      ],
    });
    render(<ChatView />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" }).getAttribute("title")).toContain("model-basic"));
    expect(screen.getByRole("radio", { name: "Kapsamlı" }).getAttribute("title")).toContain("model-deep");
  });

  it("labels answers with their level and model", async () => {
    api.getChatConversation.mockResolvedValue({
      ...CONVERSATION,
      messages: [
        msg({ id: "u1", role: "user", content: "Süre nedir?", status: null, model: null }),
        msg({ id: "a1", content: "İki haftadır.", level: "basic", model: "gpt-4o-mini" }),
      ],
    });
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);
    expect(await screen.findByText("Basit · gpt-4o-mini")).toBeInTheDocument();
  });

  it("notes answers cut off by the length limit and still allows rating them", async () => {
    api.getChatConversation.mockResolvedValue({
      ...CONVERSATION,
      messages: [
        msg({ id: "u1", role: "user", content: "Uzun soru", status: null, model: null }),
        msg({ id: "a1", content: "Yarım kalan", truncated: true }),
        msg({ id: "u2", role: "user", content: "Kısa soru", status: null, model: null }),
        msg({ id: "a2", content: "Tam yanıt", truncated: false }),
      ],
    });
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);

    expect(
      await screen.findByText("Yanıt uzunluk sınırında kesildi · daha kapsamlı bir seviyeyle tekrar sorabilirsiniz."),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/uzunluk sınırında kesildi/)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Faydalı" })).toHaveLength(2);
  });

  it("locks the level while a reply streams", async () => {
    streamChatMessage.mockImplementation(
      (_id: string, content: string, { signal, onEvent }: StreamOptions) =>
        new Promise((_resolve, reject) => {
          onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");

    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Durdur" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" })).toBeEnabled());
  });
});
