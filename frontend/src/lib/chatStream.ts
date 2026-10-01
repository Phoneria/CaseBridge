/** Reads the chat reply SSE stream (fetch + ReadableStream; EventSource
 * can't send a POST body or an Authorization header). */
import { openChatStream } from "@/lib/api";
import type { ChatStreamEvent } from "@/types";

/** Incremental SSE parser: feed it decoded text in any chunking. */
export function createSseParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) {
          try {
            onEvent(JSON.parse(data) as ChatStreamEvent);
          } catch {
            // malformed event - skip it, keep reading the stream
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    },
  };
}

export async function streamChatMessage(
  conversationId: string,
  content: string,
  { signal, onEvent }: { signal?: AbortSignal; onEvent: (event: ChatStreamEvent) => void },
): Promise<void> {
  const response = await openChatStream(conversationId, content, signal);
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
