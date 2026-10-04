/** Labels for the answer level the backend chose automatically. */
import type { ChatLevel } from "@/types";

export const CHAT_LEVEL_LABELS: Record<ChatLevel, string> = {
  basic: "Basit",
  standard: "Standart",
  deep: "Kapsamlı",
};

/** A model identifier is retained in records but never shown in the client UI. */
export function answerLabel(level: ChatLevel | null | undefined, _model: string | null | undefined): string | null {
  return level ? CHAT_LEVEL_LABELS[level] : null;
}
