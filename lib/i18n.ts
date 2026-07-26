import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

export const dictionaries = { en, tr };
export type Locale = keyof typeof dictionaries;
