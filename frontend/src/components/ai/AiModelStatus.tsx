import Link from "next/link";

import type { AIStatus } from "@/types";

/** Which model family answers: shown next to the configured status. */
export function providerBadge(provider: string | undefined | null): string | null {
  if (provider === "claude-subagent" || provider === "anthropic") return "Claude";
  if (provider === "openai") return "OpenAI";
  return null;
}

export function AiModelStatus({ status, variant }: { status: AIStatus | null; variant: "dark" | "light" }) {
  if (!status) return null;

  if (status.configured) {
    return (
      <p
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
          variant === "dark" ? "bg-glass/10 text-accent-100" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <i aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
        {status.provider === "mock" ? "Yapay zekâ gösterim modu" : "Yapay zekâ hizmeti yapılandırıldı"}
        {providerBadge(status.provider) && (
          <span data-testid="ai-provider-badge" className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {providerBadge(status.provider)}
          </span>
        )}
      </p>
    );
  }

  return (
    <p
      role="status"
      className={`mt-4 inline-flex flex-wrap items-center gap-1 rounded-xl px-3 py-1.5 text-xs ${
        variant === "dark" ? "bg-amber-400/15 text-amber-200" : "bg-amber-50 text-amber-800"
      }`}
    >
      {status.provider === "claude-subagent" ? "Claude token geçersiz, yenileyin." : "Yapay zekâ hizmeti yapılandırılmamış"} ·{" "}
      <Link href="/ayarlar" className="font-semibold underline underline-offset-2">
        Ayarlar
      </Link>
    </p>
  );
}
