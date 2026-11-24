"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";

import { createChatConversation, getChatConversation, getChatStatus } from "@/lib/api";
import { streamChatMessage } from "@/lib/chatStream";
import { safeStorage, type MascotEvent } from "@/lib/mascot";
import type { ChatMessage, ChatSource, ChatStatus } from "@/types";

export const MASCOT_CONVERSATION_KEY = "cb.mascot.conversation";
export const MASCOT_EMPTY_TITLE = "Büronuzun kayıtları hakkında sorun.";
export const MASCOT_NOT_CONFIGURED = "CaseBridge AI bağlantısı henüz yapılandırılmamış.";
const SEND_FAILED = "Mesaj gönderilemedi. Lütfen tekrar deneyin.";

const SOURCE_ICONS: Record<ChatSource["kind"], string> = {
  case: "⚖",
  document: "📄",
  precedent: "📚",
  client: "👤",
  calendar: "📅",
};

const TOOL_LABELS: Record<string, string> = {
  search_cases: "Davalar aranıyor",
  get_case: "Dava okunuyor",
  search_documents: "Belgeler aranıyor",
  get_hearings: "Duruşmalara bakılıyor",
  get_tasks: "Görevlere bakılıyor",
  search_clients: "Müvekkiller aranıyor",
  get_precedents: "Emsallere bakılıyor",
  get_calendar: "Takvime bakılıyor",
};

type PanelMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
  sources?: ChatSource[];
};

function suggestions(caseId: string | null): string[] {
  return caseId
    ? ["Bu davanın duruşmaları ne zaman?", "Bu davadaki açık görevler neler?", "Bu davanın belgelerinde ne var?"]
    : ["Bu hafta takvimimde ne var?", "Açık görevlerim neler?", "Yaklaşan duruşmalar hangileri?"];
}

function fromServer(message: ChatMessage): PanelMessage {
  return { id: message.id, role: message.role === "user" ? "user" : "assistant", content: message.content };
}

export function SourceChips({ sources, onNavigate }: { sources: ChatSource[]; onNavigate?: () => void }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Kaynaklar" className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <li key={`${source.kind}:${source.id}`} className="max-w-full">
          <Link
            href={source.href}
            onClick={onNavigate}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-800 hover:bg-accent-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <span aria-hidden="true">{SOURCE_ICONS[source.kind] ?? "•"}</span>
            <span className="truncate">{source.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MascotChatPanel({
  open,
  side,
  route,
  caseId,
  onClose,
  onHide,
  onChatEvent,
}: {
  open: boolean;
  side: "left" | "right";
  route: string;
  caseId: string | null;
  onClose: () => void;
  onHide: () => void;
  onChatEvent: (event: MascotEvent) => void;
}) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => safeStorage.get(MASCOT_CONVERSATION_KEY, "session"));
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || status || statusFailed) return;
    getChatStatus().then(setStatus).catch(() => setStatusFailed(true));
  }, [open, status, statusFailed]);

  // Reopen the conversation of this browser tab (messages only; links are shown for new answers).
  useEffect(() => {
    if (!open || loadedRef.current || !conversationId) return;
    loadedRef.current = true;
    getChatConversation(conversationId)
      .then((conversation) => setMessages(conversation.messages.filter((m) => m.content).map(fromServer)))
      .catch(() => {
        safeStorage.set(MASCOT_CONVERSATION_KEY, null, "session");
        setConversationId(null);
      });
  }, [open, conversationId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, toolLabel]);

  // Leaving the page stops a running answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  function newConversation() {
    abortRef.current?.abort();
    safeStorage.set(MASCOT_CONVERSATION_KEY, null, "session");
    loadedRef.current = true;
    setConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || busy) return;
    setError(null);
    setDraft("");
    setBusy(true);
    onChatEvent({ type: "send" });
    const local = `local-${Date.now()}`;
    let assistantId = `${local}-a`;
    setMessages((previous) => [
      ...previous,
      { id: `${local}-u`, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    const patch = (change: (message: PanelMessage) => PanelMessage) =>
      setMessages((previous) => previous.map((message) => (message.id === assistantId ? change(message) : message)));

    try {
      let id = conversationId;
      if (!id) {
        loadedRef.current = true; // its messages are already on screen: never reload them
        const created = await createChatConversation();
        id = created.id;
        setConversationId(id);
        safeStorage.set(MASCOT_CONVERSATION_KEY, id, "session");
      }
      const controller = new AbortController();
      abortRef.current = controller;
      await streamChatMessage(id, text, {
        signal: controller.signal,
        dataTools: true,
        context: { route, case_id: caseId },
        onEvent: (event) => {
          switch (event.type) {
            case "start": {
              const previousId = assistantId;
              assistantId = event.assistant_message_id;
              setMessages((rows) => rows.map((row) => (row.id === previousId ? { ...row, id: assistantId } : row)));
              break;
            }
            case "tool":
              if (event.status === "start") {
                setToolLabel(TOOL_LABELS[event.name] ?? "Kayıtlara bakılıyor");
                onChatEvent({ type: "tool" });
              }
              break;
            case "sources":
              patch((message) => ({ ...message, sources: event.sources }));
              break;
            case "delta":
              setToolLabel(null);
              onChatEvent({ type: "delta" });
              patch((message) => ({ ...message, content: message.content + event.text }));
              break;
            case "done":
              patch((message) => ({
                ...message,
                pending: false,
                content: event.message?.content ?? message.content,
                sources: event.sources ?? message.sources,
              }));
              break;
            case "error":
              patch((message) => ({ ...message, pending: false, error: event.message }));
              break;
          }
        },
      });
      patch((message) => ({ ...message, pending: false }));
    } catch (caught) {
      if ((caught as { name?: string } | null)?.name !== "AbortError") {
        setError(caught instanceof Error && caught.message ? caught.message : SEND_FAILED);
        setMessages((rows) => rows.filter((row) => row.id !== assistantId || row.content));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setToolLabel(null);
      onChatEvent({ type: "finish" });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  if (!open) return null;
  const notConfigured = status !== null && !status.configured;
  const sideClasses = side === "left" ? "sm:left-4" : "sm:right-4";

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="CaseBridge AI asistanı"
      data-testid="mascot-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className={`fixed inset-0 z-50 flex flex-col bg-surface-muted shadow-2xl ring-1 ring-surface-border sm:inset-auto sm:bottom-28 ${sideClasses} sm:h-[560px] sm:max-h-[calc(100dvh-8rem)] sm:w-[400px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl`}
    >
      <header className="flex items-center gap-2 border-b border-surface-border bg-navy-950 px-4 py-3 text-white sm:rounded-t-2xl">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">CaseBridge AI</h2>
        <button type="button" onClick={newConversation} className="rounded-lg px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white">
          Yeni sohbet
        </button>
        <button type="button" onClick={onHide} className="rounded-lg px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white">
          Kediyi gizle
        </button>
        <button type="button" onClick={onClose} aria-label="Paneli küçült" className="rounded-lg px-2 py-1 text-lg leading-none text-white/80 hover:bg-white/10 hover:text-white">
          <span aria-hidden="true">–</span>
        </button>
      </header>

      <ol ref={listRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 && !notConfigured && (
          <li className="rounded-2xl bg-white p-4 text-sm text-navy-700 ring-1 ring-surface-border">
            <p className="font-medium text-navy-900">{MASCOT_EMPTY_TITLE}</p>
            <p className="mt-1 text-xs text-navy-500">Yalnız büronuzun ve yetkinizin izin verdiği kayıtlar okunur; hiçbir kayıt değiştirilmez.</p>
            <ul className="mt-3 space-y-1.5">
              {suggestions(caseId).map((text) => (
                <li key={text}>
                  <button type="button" onClick={() => void send(text)} disabled={busy}
                    className="w-full rounded-xl border border-surface-border bg-surface-muted px-3 py-2 text-left text-xs text-navy-700 hover:border-accent-300 hover:bg-accent-50">
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
        {notConfigured && (
          <li role="status" className="rounded-2xl bg-white p-4 text-sm text-navy-700 ring-1 ring-surface-border">
            <p className="font-medium text-navy-900">{MASCOT_NOT_CONFIGURED}</p>
            {status?.error && <p className="mt-1 text-xs text-navy-500">{status.error}</p>}
          </li>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <li key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-navy-900 px-3 py-2 text-sm text-white">{message.content}</p>
            </li>
          ) : (
            <li key={message.id} className="max-w-[92%]">
              <div className="chat-markdown rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm leading-6 text-navy-800 ring-1 ring-surface-border">
                {message.content ? (
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                ) : message.pending ? (
                  <span className="text-navy-500">{toolLabel ? `${toolLabel}…` : "Düşünüyor…"}</span>
                ) : null}
                {message.error && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{message.error}</p>}
              </div>
              <SourceChips sources={message.sources ?? []} onNavigate={() => { if (window.innerWidth < 640) onClose(); }} />
            </li>
          ),
        )}
      </ol>

      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>
      )}
      {statusFailed && !error && (
        <p role="alert" className="mx-4 mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">CaseBridge AI durumu alınamadı.</p>
      )}

      <form onSubmit={submit} className="border-t border-surface-border bg-white p-3 sm:rounded-b-2xl">
        <label htmlFor="mascot-input" className="sr-only">CaseBridge AI'a sorun</label>
        <div className="flex items-end gap-2">
          <textarea
            id="mascot-input"
            ref={inputRef}
            rows={2}
            value={draft}
            maxLength={8000}
            disabled={notConfigured}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Örn. Bu davanın duruşmaları ne zaman?"
            className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-surface-border bg-surface-muted px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
          <button type="submit" disabled={busy || notConfigured || !draft.trim()}
            className="rounded-xl bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">
            Gönder
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-navy-500">
          Yanıtlar hukuki danışmanlık yerine geçmez; kaynakları açıp doğrulayın.{" "}
          {conversationId && <Link href={`/ai/sohbet?sohbet=${conversationId}`} className="underline" onClick={onClose}>Tam ekranda aç</Link>}
        </p>
      </form>
    </section>
  );
}
