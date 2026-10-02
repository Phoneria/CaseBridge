/** Labels for the answer level the backend chose automatically. */
import type { ChatLevel } from "@/types";

export const CHAT_LEVEL_LABELS: Record<ChatLevel, string> = {
  basic: "Basit",
  standard: "Standart",
  deep: "Kapsamlı",
};

/** "Basit · gpt-4o-mini"; model only for answers saved before levels existed. */
export function answerLabel(level: ChatLevel | null | undefined, model: string | null | undefined): string | null {
  const parts = [level ? CHAT_LEVEL_LABELS[level] : null, model || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
