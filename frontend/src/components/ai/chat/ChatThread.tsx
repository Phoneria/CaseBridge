"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

import { AiMark } from "@/components/ai/AiMark";
import type { ChatFeedbackValue, ChatMessage } from "@/types";

/** A message as shown in the thread; errorText is the live SSE error text. */
export type ChatThreadMessage = ChatMessage & { errorText?: string };

export const CHAT_EXAMPLE_PROMPTS = [
  "Kira artış oranı nasıl belirlenir?",
  "İhtiyati haciz için hangi şartlar aranır?",
  "İşe iade davası açma süresi ne kadardır?",
] as const;

function FeedbackButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-sm transition ${
        pressed ? "bg-accent-100 ring-1 ring-accent-300" : "opacity-60 hover:bg-white hover:opacity-100"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function AssistantMessage({
  message,
  live,
  onFeedback,
}: {
  message: ChatThreadMessage;
  live: boolean;
  onFeedback: (message: ChatThreadMessage, value: ChatFeedbackValue) => void;
}) {
  // Only the reply streaming in this session is live; a "streaming" row loaded
  // from the server will never finish, so it reads as stopped.
  const streaming = message.status === "streaming" && live;
  const stopped = message.status === "stopped" || (message.status === "streaming" && !live);
  return (
    <li className="flex gap-3">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-950">
        <AiMark className="h-3.5 w-3.5 text-accent-300" />
      </span>
      <div className="min-w-0 max-w-[85%]">
        <div className="chat-markdown rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-6 text-navy-800 shadow-card ring-1 ring-surface-border">
          {message.content ? (
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            streaming && <span className="sr-only">Yanıt yazılıyor</span>
          )}
          {streaming && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent-500 align-text-bottom motion-reduce:animate-none"
            />
          )}
        </div>
        {message.status === "error" && (
          <p role="alert" className="mt-1.5 inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Hata · {message.errorText ?? "Yanıt alınamadı."}
          </p>
        )}
        {stopped && (
          <p className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-navy-600">Durduruldu</p>
        )}
        {message.status === "complete" && (
          <div className="mt-1 flex gap-1">
            <FeedbackButton label="Faydalı" icon="👍" pressed={message.feedback === 1} onClick={() => onFeedback(message, 1)} />
            <FeedbackButton label="Faydalı değil" icon="👎" pressed={message.feedback === -1} onClick={() => onFeedback(message, -1)} />
          </div>
        )}
      </div>
    </li>
  );
}

export function ChatThread({
  messages,
  loading,
  streaming,
  examplesDisabled,
  onFeedback,
  onExample,
}: {
  messages: ChatThreadMessage[];
  loading: boolean;
  streaming: boolean;
  examplesDisabled: boolean;
  onFeedback: (message: ChatThreadMessage, value: ChatFeedbackValue) => void;
  onExample: (prompt: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    // scrollIntoView is missing in jsdom, hence the optional call.
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, last?.content]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-navy-500">Sohbet yükleniyor…</p>;
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
        <AiMark className="h-8 w-8 text-accent-500" />
        <div>
          <h2 className="text-base font-semibold text-navy-900">Bugün size nasıl yardımcı olabilirim?</h2>
          <p className="mt-1 text-sm text-navy-500">Türk hukukuna dair genel bir soru sorun ya da bir örnekle başlayın.</p>
        </div>
        <ul aria-label="Örnek sorular" className="flex flex-wrap justify-center gap-2">
          {CHAT_EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                disabled={examplesDisabled}
                onClick={() => onExample(prompt)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-accent-700 ring-1 ring-accent-200 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <ol aria-label="Mesajlar" className="space-y-5">
        {messages.map((message) =>
          message.role === "user" ? (
            <li key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-navy-900 px-4 py-2.5 text-sm leading-6 text-white">
                {message.content}
              </p>
            </li>
          ) : (
            <AssistantMessage key={message.id} message={message} live={streaming && message === last} onFeedback={onFeedback} />
          ),
        )}
      </ol>
      <div ref={endRef} />
    </>
  );
}
