"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  createChatConversation,
  deleteChatConversation,
  downloadChatExport,
  getChatConversation,
  getChatStatus,
  getMe,
  listChatConversations,
  renameChatConversation,
  setChatFeedback,
} from "@/lib/api";
import { AI_ROUTES } from "@/lib/ai";
import { DEFAULT_CHAT_LEVEL, readStoredChatLevel, storeChatLevel } from "@/lib/chatLevels";
import { streamChatMessage } from "@/lib/chatStream";
import { saveBlob } from "@/lib/download";
import { buildHref } from "@/lib/filters";
import type { AppUser, ChatConversationSummary, ChatFeedbackValue, ChatLevel, ChatMessageStatus, ChatRole, ChatStatus } from "@/types";
import { AiHero } from "@/components/ai/AiHero";
import { AiModelStatus } from "@/components/ai/AiModelStatus";
import { ChatComposer } from "@/components/ai/chat/ChatComposer";
import { ChatLevelPicker } from "@/components/ai/chat/ChatLevelPicker";
import { ChatConversationList } from "@/components/ai/chat/ChatConversationList";
import { ChatThread, type ChatThreadMessage } from "@/components/ai/chat/ChatThread";
import { ErrorState } from "@/components/ErrorState";

export const CHAT_DISCLAIMER = "CaseBridge AI hukuki danışmanlık yerine geçmez; yanıtları doğrulayın.";
export const CHAT_EXTERNAL_WARNING = "Mesajlar harici bir AI sağlayıcısına gönderilir; müvekkil kişisel verisi girmeyin.";
export const CHAT_EXPORT_FILENAME = "casebridge-chat-egitim.jsonl";

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function draftMessage(
  role: ChatRole,
  content: string,
  status: ChatMessageStatus | null,
  level: ChatLevel | null = null,
): ChatThreadMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    status,
    model: null,
    level,
    feedback: null,
    created_at: new Date().toISOString(),
  };
}

export function ChatView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramId = searchParams.get("sohbet");
  const paramRef = useRef(paramId);
  paramRef.current = paramId;
  const activeRef = useRef<string | null>(paramId);

  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [me, setMe] = useState<AppUser | null>(null);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(paramId);
  activeRef.current = activeId;
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [level, setLevel] = useState<ChatLevel>(DEFAULT_CHAT_LEVEL);
  const abortRef = useRef<AbortController | null>(null);
  // Set when a conversation is created by send(): its messages are already
  // on screen (optimistic + streaming), so it must not be reloaded.
  const skipLoadRef = useRef<string | null>(null);

  useEffect(() => {
    setLevel(readStoredChatLevel());
  }, []);

  function changeLevel(next: ChatLevel) {
    setLevel(next);
    storeChatLevel(next);
  }

  const refreshConversations = useCallback(
    () =>
      listChatConversations()
        .then(setConversations)
        .catch(() => setError("Sohbetler yüklenemedi.")),
    [],
  );

  useEffect(() => {
    getChatStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
    refreshConversations().finally(() => setListLoading(false));
  }, [refreshConversations]);

  // Abort an in-flight stream when the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow external URL changes (e.g. the sidebar link opens a fresh chat).
  useEffect(() => {
    // Leaving the conversation that is streaming: stop its reply.
    if (paramId !== activeRef.current) abortRef.current?.abort();
    setActiveId(paramId);
  }, [paramId]);

  // Mirror the open conversation into ?sohbet=.
  useEffect(() => {
    if (activeId === paramRef.current) return;
    router.replace(buildHref(AI_ROUTES.chat, { sohbet: activeId }));
  }, [activeId, router]);

  // Load the open conversation.
  useEffect(() => {
    if (!activeId) {
      skipLoadRef.current = null;
      setMessages([]);
      setThreadLoading(false);
      return;
    }
    if (skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    getChatConversation(activeId)
      .then((conversation) => {
        if (!cancelled) setMessages(conversation.messages);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Sohbet bulunamadı.");
        setActiveId(null);
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  async function send(content: string) {
    if (streaming) return;
    setError(null);

    let conversationId = activeId;
    if (!conversationId) {
      try {
        const created = await createChatConversation();
        skipLoadRef.current = created.id;
        conversationId = created.id;
        setConversations((previous) => [created, ...previous]);
        setActiveId(created.id);
      } catch {
        setError("Sohbet oluşturulamadı.");
        return;
      }
    }

    const userDraft = draftMessage("user", content, null);
    const assistantDraft = draftMessage("assistant", "", "streaming", level);
    let assistantId = assistantDraft.id;
    const updateAssistant = (change: (message: ChatThreadMessage) => ChatThreadMessage) =>
      setMessages((previous) =>
        previous.map((message) => (message.id === assistantId || message.id === assistantDraft.id ? change(message) : message)),
      );

    setMessages((previous) => [...previous, userDraft, assistantDraft]);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      await streamChatMessage(conversationId, content, {
        level,
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "start":
              assistantId = event.assistant_message_id;
              setMessages((previous) =>
                previous.map((message) =>
                  message.id === userDraft.id
                    ? event.user_message
                    : message.id === assistantDraft.id
                      ? { ...message, id: event.assistant_message_id }
                      : message,
                ),
              );
              break;
            case "delta":
              updateAssistant((message) => ({ ...message, content: message.content + event.text }));
              break;
            case "done":
              if (event.message) {
                const finished = event.message;
                updateAssistant(() => finished);
              }
              break;
            case "error":
              updateAssistant((message) => ({ ...message, status: "error", errorText: event.message }));
              break;
          }
        },
      });
    } catch (err) {
      if (!isAbortError(err)) {
        const text = err instanceof Error ? err.message : "Yanıt alınamadı.";
        updateAssistant((message) => ({ ...message, status: "error", errorText: text }));
      }
    } finally {
      // Aborted, or the connection ended without done/error: the backend
      // stores the partial reply as "stopped", so mirror that.
      updateAssistant((message) => (message.status === "streaming" ? { ...message, status: "stopped" } : message));
      abortRef.current = null;
      setStreaming(false);
      void refreshConversations();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function rate(message: ChatThreadMessage, value: ChatFeedbackValue) {
    const next = message.feedback === value ? 0 : value;
    try {
      const updated = await setChatFeedback(message.id, next);
      setMessages((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setError("Geri bildirim kaydedilemedi.");
    }
  }

  async function rename(id: string, title: string) {
    try {
      const updated = await renameChatConversation(id, title);
      setConversations((previous) =>
        previous.map((item) => (item.id === id ? { ...item, title: updated.title, updated_at: updated.updated_at } : item)),
      );
    } catch {
      setError("Sohbet yeniden adlandırılamadı.");
    }
  }

  async function remove(id: string) {
    try {
      await deleteChatConversation(id);
      setConversations((previous) => previous.filter((item) => item.id !== id));
      if (id === activeId) setActiveId(null);
    } catch {
      setError("Sohbet silinemedi.");
    }
  }

  function open(id: string | null) {
    setError(null);
    setListOpen(false);
    setActiveId(id);
  }

  async function exportTrainingData() {
    try {
      saveBlob(await downloadChatExport(), CHAT_EXPORT_FILENAME);
    } catch {
      setError("Eğitim verisi indirilemedi.");
    }
  }

  const composerDisabled = status !== null && !status.configured;

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Hukuk Asistanı"
        description="Türk hukukuna dair genel sorularınızı sorun; yanıt kelime kelime akar, sohbetleriniz kaydedilir."
        actions={
          me?.role === "admin" ? (
            <button
              type="button"
              onClick={exportTrainingData}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              Eğitim verisini indir (JSONL)
            </button>
          ) : undefined
        }
      >
        <AiModelStatus status={status} variant="dark" />
      </AiHero>

      {error && <ErrorState message={error} />}

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-surface-border bg-white p-3 shadow-card md:self-start">
          <button
            type="button"
            aria-expanded={listOpen}
            onClick={() => setListOpen((value) => !value)}
            className="flex w-full items-center justify-between text-sm font-semibold text-navy-900 md:hidden"
          >
            Sohbetler
            <span aria-hidden="true">{listOpen ? "▴" : "▾"}</span>
          </button>
          <div className={`${listOpen ? "mt-3 block" : "hidden"} md:mt-0 md:block`}>
            <ChatConversationList
              conversations={conversations}
              activeId={activeId}
              loading={listLoading}
              disabled={streaming}
              onSelect={open}
              onNew={() => open(null)}
              onRename={rename}
              onDelete={remove}
            />
          </div>
        </aside>

        <section aria-label="Sohbet" aria-busy={streaming} className="flex flex-col rounded-2xl border border-surface-border bg-surface-muted">
          <div className="max-h-[calc(100vh-20rem)] min-h-[22rem] flex-1 overflow-y-auto p-4 sm:p-6">
            <ChatThread
              messages={messages}
              loading={threadLoading}
              streaming={streaming}
              examplesDisabled={composerDisabled || streaming}
              onFeedback={rate}
              onExample={send}
            />
          </div>
          <div className="border-t border-surface-border p-3 sm:p-4">
            <ChatLevelPicker
              value={level}
              levels={status?.levels ?? []}
              disabled={composerDisabled || streaming}
              onChange={changeLevel}
            />
            <ChatComposer disabled={composerDisabled} streaming={streaming} onSend={send} onStop={stop} />
            <p className="mt-2 text-[11px] text-navy-500">{CHAT_DISCLAIMER}</p>
            {status?.external && <p className="mt-1 text-[11px] font-medium text-amber-700">{CHAT_EXTERNAL_WARNING}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
