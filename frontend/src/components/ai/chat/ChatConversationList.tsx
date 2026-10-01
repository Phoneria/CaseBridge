"use client";

import { useRef, useState } from "react";

import { formatDate } from "@/lib/labels";
import type { ChatConversationSummary } from "@/types";

export function ChatConversationList({
  conversations,
  activeId,
  loading,
  disabled,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ChatConversationSummary[];
  activeId: string | null;
  loading: boolean;
  /** True while a reply streams: switching away is blocked. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function startRename(conversation: ChatConversationSummary) {
    cancelledRef.current = false;
    setConfirmId(null);
    setDraft(conversation.title);
    setEditingId(conversation.id);
  }

  // Enter blurs the input; blur is the single place a rename is committed.
  function commitRename(conversation: ChatConversationSummary) {
    setEditingId(null);
    if (cancelledRef.current) return;
    const title = draft.trim().slice(0, 120);
    if (title && title !== conversation.title) onRename(conversation.id, title);
  }

  return (
    <nav aria-label="Sohbetler" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">+</span>
        Yeni sohbet
      </button>

      {loading ? (
        <p className="px-1 text-xs text-navy-500">Yükleniyor…</p>
      ) : conversations.length === 0 ? (
        <p className="px-1 text-xs text-navy-500">Henüz sohbet yok.</p>
      ) : (
        <ul className="space-y-1">
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;
            if (editingId === conversation.id) {
              return (
                <li key={conversation.id} className="px-1 py-1">
                  <input
                    aria-label="Sohbet adı"
                    autoFocus
                    value={draft}
                    maxLength={120}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        cancelledRef.current = true;
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={() => commitRename(conversation)}
                    className="w-full rounded-lg border border-accent-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:ring-2 focus:ring-accent-200"
                  />
                </li>
              );
            }
            return (
              <li
                key={conversation.id}
                className={`rounded-xl ${active ? "bg-accent-50 ring-1 ring-accent-200" : "hover:bg-surface-muted"}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  disabled={disabled}
                  aria-current={active ? "true" : undefined}
                  className="block w-full px-3 pt-2 text-left disabled:cursor-not-allowed"
                >
                  <span className="block truncate text-sm font-medium text-navy-800">{conversation.title}</span>
                  <span className="block text-[11px] text-navy-500">{formatDate(conversation.updated_at)}</span>
                </button>
                {confirmId === conversation.id ? (
                  <div className="flex items-center gap-3 px-3 pb-2 pt-1 text-[11px]">
                    <span className="text-navy-600">Silinsin mi?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(null);
                        onDelete(conversation.id);
                      }}
                      className="font-semibold text-red-600 hover:text-red-700"
                    >
                      Evet, sil
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-navy-500 hover:text-navy-800">
                      Vazgeç
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3 px-3 pb-2 pt-1 text-[11px]">
                    <button
                      type="button"
                      aria-label={`Yeniden adlandır: ${conversation.title}`}
                      onClick={() => startRename(conversation)}
                      disabled={disabled}
                      className="text-navy-500 hover:text-accent-700 disabled:opacity-50"
                    >
                      Yeniden adlandır
                    </button>
                    <button
                      type="button"
                      aria-label={`Sil: ${conversation.title}`}
                      onClick={() => setConfirmId(conversation.id)}
                      disabled={disabled}
                      className="text-navy-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Sil
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
