"use client";

import { CHAT_LEVEL_OPTIONS } from "@/lib/chatLevels";
import type { ChatLevel, ChatLevelInfo } from "@/types";

export function ChatLevelPicker({
  value,
  levels,
  disabled,
  onChange,
}: {
  value: ChatLevel;
  /** From /chat/status; used to show each level's model in its hint. */
  levels: ChatLevelInfo[];
  disabled: boolean;
  onChange: (level: ChatLevel) => void;
}) {
  const selected = CHAT_LEVEL_OPTIONS.find((option) => option.level === value);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-label="Yanıt seviyesi" className="inline-flex rounded-xl bg-white p-1 ring-1 ring-surface-border">
        {CHAT_LEVEL_OPTIONS.map((option) => {
          const checked = option.level === value;
          const model = levels.find((level) => level.level === option.level)?.model;
          return (
            <button
              key={option.level}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              title={model ? `${option.hint} · Model: ${model}` : option.hint}
              onClick={() => onChange(option.level)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? "bg-accent-600 text-white" : "text-navy-600 hover:bg-accent-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selected && <span className="text-[11px] text-navy-500">{selected.hint}</span>}
    </div>
  );
}
