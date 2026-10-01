import Link from "next/link";

import type { AIStatus } from "@/types";

export function AiModelStatus({ status, variant }: { status: AIStatus | null; variant: "dark" | "light" }) {
  if (!status) return null;

  if (status.configured) {
    return (
      <p
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
          variant === "dark" ? "bg-white/10 text-accent-100" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <i aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
        Model: {status.provider} · Hazır
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
      AI modeli yapılandırılmamış ·{" "}
      <Link href="/ayarlar" className="font-semibold underline underline-offset-2">
        Ayarlar
      </Link>
    </p>
  );
}
