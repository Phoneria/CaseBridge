"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_LENGTH = 8000;

export function ChatComposer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const canSend = !disabled && !streaming && value.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line; ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-2xl border border-surface-border bg-white p-2 shadow-card focus-within:border-accent-400"
    >
      <textarea
        aria-label="Mesajınız"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={2}
        maxLength={MAX_LENGTH}
        placeholder="Bir hukuki soru sorun… (Enter gönderir, Shift+Enter yeni satır)"
        className="min-h-[3rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-navy-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Durdur
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Gönder
        </button>
      )}
    </form>
  );
}
