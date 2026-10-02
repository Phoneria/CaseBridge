/** Answer levels for the Hukuk Asistanı. The backend maps each level to a
 * model, a token cap and a history size; the frontend only sends the name. */
import type { ChatLevel } from "@/types";

export const CHAT_LEVEL_STORAGE_KEY = "casebridge_chat_level";
export const DEFAULT_CHAT_LEVEL: ChatLevel = "standard";

export const CHAT_LEVEL_OPTIONS: { level: ChatLevel; label: string; hint: string }[] = [
  { level: "basic", label: "Basit", hint: 'Kısa tanım, süre ve "nedir?" soruları' },
  { level: "standard", label: "Standart", hint: "Çoğu soru için" },
  { level: "deep", label: "Kapsamlı", hint: "Çok adımlı analiz ve mevzuat karşılaştırması" },
];

export const CHAT_LEVEL_LABELS: Record<ChatLevel, string> = {
  basic: "Basit",
  standard: "Standart",
  deep: "Kapsamlı",
};

export function isChatLevel(value: unknown): value is ChatLevel {
  return value === "basic" || value === "standard" || value === "deep";
}

export function readStoredChatLevel(): ChatLevel {
  try {
    const value = window.localStorage.getItem(CHAT_LEVEL_STORAGE_KEY);
    return isChatLevel(value) ? value : DEFAULT_CHAT_LEVEL;
  } catch {
    return DEFAULT_CHAT_LEVEL;
  }
}

export function storeChatLevel(level: ChatLevel): void {
  try {
    window.localStorage.setItem(CHAT_LEVEL_STORAGE_KEY, level);
  } catch {
    // storage unavailable (private mode, blocked) - the choice just isn't remembered
  }
}

/** "Basit · gpt-4o-mini"; model only for answers saved before levels existed. */
export function answerLabel(level: ChatLevel | null | undefined, model: string | null | undefined): string | null {
  const parts = [level ? CHAT_LEVEL_LABELS[level] : null, model || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
