import { ApiError } from "@/lib/apiError";

/** What to show the user for a failed call: the server's Turkish message for
 * an ApiError, otherwise the Turkish fallback. Never a raw Error message. */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
