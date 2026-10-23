export type Notice = { tone: "ok" | "warn" | "error"; text: string };

const TONES = { ok: "text-emerald-700", warn: "text-amber-700", error: "text-red-700" } as const;

/** One-line outcome of the last action: a status for success, an alert otherwise. */
export function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p role={notice.tone === "ok" ? "status" : "alert"} className={`mb-3 text-sm ${TONES[notice.tone]}`}>
      {notice.text}
    </p>
  );
}
